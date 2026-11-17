/**
 * Proceso principal de Electron.
 *  - Ventana principal (imputación, histórico, proyectos, configuración).
 *  - Ventana independiente del reloj flotante (siempre encima, transparente, arrastrable).
 *  - Recordatorios gestionados aquí, de modo que funcionan con la interfaz oculta.
 *  - Bandeja del sistema, inicio con Windows, copias de seguridad y exportación.
 */
import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  powerMonitor,
  screen,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { autoBackup, exportBackup, importBackup } from './backup';
import { Store } from './db';
import { toCsv, toXlsx } from './exporter';
import { initLogger, log } from './logger';
import { ReminderScheduler, endOfToday } from './reminders';
import { Repo } from './repo';
import { ValidationError, isWorkday, todayIso } from '../shared/rules';
import type {
  AbsenceInput,
  EntryInput,
  HistoryFilter,
  IpcResult,
  ProjectInput,
  ReminderAlert,
  Settings,
  SharedDistribution,
} from '../shared/types';
import type { PauseOption } from '../shared/api';

// ---------------------------------------------------------------------------
// Rutas y arranque
// ---------------------------------------------------------------------------

// Permite aislar los datos en pruebas automáticas. En uso normal: %APPDATA%/Gestor de Horas
if (process.env.GESTOR_USER_DATA) app.setPath('userData', process.env.GESTOR_USER_DATA);
// Interfaz en español (formato de fecha DD/MM/AAAA en los selectores) sea cual sea el idioma del sistema.
app.commandLine.appendSwitch('lang', 'es-ES');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const START_HIDDEN = process.argv.includes('--hidden');
const FLOAT_SIZE = 84;
const ASSETS = path.join(__dirname, 'assets');

const userData = app.getPath('userData');
const dbPath = path.join(userData, 'gestor-horas.sqlite');
const backupDir = path.join(userData, 'copias-seguridad');
const logPath = initLogger(path.join(userData, 'logs'));

let store: Store;
let repo: Repo;
let scheduler: ReminderScheduler;
let mainWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let dragOrigin: { x: number; y: number } | null = null;

process.on('uncaughtException', (e) => log.error('uncaughtException', e));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', e));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => restoreMain());
  app.whenReady().then(init).catch((e) => {
    log.error('Error fatal al iniciar', e);
    dialog.showErrorBox('Gestor de Horas', `No se pudo iniciar la aplicación:\n\n${(e as Error).message}\n\nLog: ${logPath}`);
    app.exit(1);
  });
}

async function init() {
  app.setAppUserModelId('com.gestorhoras.app');
  Menu.setApplicationMenu(null);
  log.info(`Inicio v${app.getVersion()} – datos en ${userData}`);

  try {
    autoBackup(dbPath, backupDir, todayIso());
  } catch (e) {
    log.warn('No se pudo crear la copia automática', e);
  }
  store = await Store.open(dbPath);
  store.onPersistError = (e) => log.error('No se pudo guardar la base de datos en disco (se reintentará)', e);
  repo = new Repo(store);
  // Cada 5 min: reintenta guardados pendientes y crea la copia diaria si ha cambiado el día
  // (la aplicación puede pasar días abierta en la bandeja).
  setInterval(() => {
    if (store.dirty) store.safePersist();
    try {
      autoBackup(dbPath, backupDir, todayIso());
    } catch (e) {
      log.warn('No se pudo crear la copia automática', e);
    }
  }, 5 * 60_000);

  scheduler = new ReminderScheduler({
    getConfig: () => {
      const s = repo.getSettings();
      return { enabled: s.remindersEnabled, intervalMinutes: s.reminderIntervalMinutes };
    },
    shouldSkip: () => {
      const s = repo.getSettings();
      // Nunca se avisa en días no laborables (fines de semana por defecto).
      if (!isWorkday(todayIso(), s.workDays)) return true;
      if (!s.skipRemindersWhenComplete || !s.currentUserId) return false;
      return repo.daySummary(s.currentUserId, todayIso()).complete;
    },
    onFire: fireReminder,
    onStatus: (st) => broadcast('reminders:status', st),
  });

  applyTheme(repo.getSettings());
  registerIpc();
  createMainWindow();
  createTray();
  applyAutoStart(repo.getSettings().autoStart);
  scheduler.restart();

  powerMonitor.on('resume', () => scheduler.tick());
  powerMonitor.on('unlock-screen', () => scheduler.tick());
}

app.on('before-quit', () => {
  quitting = true;
  scheduler?.stop();
  if (store && !store.safePersist()) log.error('Error al guardar al salir');
});

app.on('window-all-closed', () => {
  if (quitting) app.quit();
});

// ---------------------------------------------------------------------------
// Ventanas
// ---------------------------------------------------------------------------

function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
    autoplayPolicy: 'no-user-gesture-required',
  };
}

function loadPage(win: BrowserWindow, page: 'index' | 'floating') {
  if (DEV_URL) win.loadURL(`${DEV_URL}/${page === 'index' ? '' : 'floating.html'}`);
  else win.loadFile(path.join(__dirname, '..', 'dist', `${page}.html`));
}

function hardenNavigation(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (DEV_URL) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') win.webContents.toggleDevTools();
    });
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Gestor de Horas',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1120' : '#f6f7f9',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: secureWebPreferences(),
  });
  hardenNavigation(mainWindow);
  loadPage(mainWindow, 'index');

  mainWindow.once('ready-to-show', () => {
    if (START_HIDDEN) syncFloating();
    else mainWindow?.show();
  });

  mainWindow.on('minimize', () => {
    if (repo.getSettings().minimizeToTray) mainWindow?.hide();
    syncFloating();
  });
  mainWindow.on('restore', syncFloating);
  mainWindow.on('show', syncFloating);
  mainWindow.on('hide', syncFloating);
  mainWindow.on('focus', () => mainWindow?.flashFrame(false));
  // Cierre de sesión / apagado de Windows: no bloquear con el "ocultar en bandeja".
  mainWindow.on('session-end', () => {
    quitting = true;
  });

  mainWindow.on('close', (e) => {
    if (quitting) return;
    if (repo.getSettings().minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    } else {
      quitting = true;
      app.quit();
    }
  });
  mainWindow.webContents.on('render-process-gone', (_e, d) => log.error(`Renderer principal caído: ${d.reason}`));
}

function mainIsShown(): boolean {
  return !!mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized();
}

/** El reloj flotante se muestra siempre que la ventana principal no esté visible. */
function syncFloating() {
  if (quitting) return;
  if (mainIsShown()) floatingWindow?.hide();
  else showFloating();
}

export function restoreMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  syncFloating();
}

function toFloating() {
  mainWindow?.hide();
  syncFloating();
}

function createFloatingWindow() {
  const pos = floatingPosition();
  floatingWindow = new BrowserWindow({
    width: FLOAT_SIZE,
    height: FLOAT_SIZE,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false, // no roba el foco a la aplicación en la que se trabaja
    hasShadow: false,
    title: 'Gestor de Horas – reloj',
    backgroundColor: '#00000000',
    webPreferences: secureWebPreferences(),
  });
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  floatingWindow.setVisibleOnAllWorkspaces(true);
  // Las zonas transparentes dejan pasar los clics; el renderer lo desactiva al pasar sobre el reloj.
  floatingWindow.setIgnoreMouseEvents(true, { forward: true });
  hardenNavigation(floatingWindow);
  loadPage(floatingWindow, 'floating');
  floatingWindow.on('closed', () => (floatingWindow = null));
  floatingWindow.webContents.on('render-process-gone', (_e, d) => log.error(`Renderer del reloj caído: ${d.reason}`));
}

function showFloating() {
  if (!floatingWindow) {
    createFloatingWindow();
    floatingWindow!.once('ready-to-show', () => floatingWindow?.showInactive());
    return;
  }
  const p = floatingPosition();
  floatingWindow.setPosition(p.x, p.y);
  // Al reaparecer, las zonas transparentes vuelven a dejar pasar los clics.
  floatingWindow.setIgnoreMouseEvents(true, { forward: true });
  floatingWindow.webContents.send('floating:shown');
  if (!floatingWindow.isVisible()) floatingWindow.showInactive();
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
}

/** Calcula la posición del reloj: la guardada si sigue siendo visible en alguna pantalla, o un preset. */
function floatingPosition(): { x: number; y: number } {
  const s = repo.getSettings();
  if (s.floatingPosition === 'custom' && s.floatingX !== null && s.floatingY !== null) {
    const rect = { x: s.floatingX, y: s.floatingY, width: FLOAT_SIZE, height: FLOAT_SIZE };
    const wa = screen.getDisplayMatching(rect).workArea;
    const visible =
      rect.x + FLOAT_SIZE / 2 >= wa.x &&
      rect.x + FLOAT_SIZE / 2 <= wa.x + wa.width &&
      rect.y + FLOAT_SIZE / 2 >= wa.y &&
      rect.y + FLOAT_SIZE / 2 <= wa.y + wa.height;
    if (visible) return { x: rect.x, y: rect.y };
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const m = 12;
  const preset = s.floatingPosition === 'custom' ? 'bottom-right' : s.floatingPosition;
  const left = wa.x + m;
  const right = wa.x + wa.width - FLOAT_SIZE - m;
  const top = wa.y + m;
  const bottom = wa.y + wa.height - FLOAT_SIZE - m;
  switch (preset) {
    case 'top-left':
      return { x: left, y: top };
    case 'top-right':
      return { x: right, y: top };
    case 'bottom-left':
      return { x: left, y: bottom };
    default:
      return { x: right, y: bottom };
  }
}

// ---------------------------------------------------------------------------
// Recordatorios
// ---------------------------------------------------------------------------

function fireReminder() {
  const s = repo.getSettings();
  const alert: ReminderAlert = { sound: s.soundEnabled, volume: s.soundVolume, animation: s.animationEnabled };
  log.info('Recordatorio de imputación');
  if (floatingWindow && floatingWindow.isVisible()) {
    floatingWindow.webContents.send('reminder', alert);
  } else if (mainWindow) {
    mainWindow.webContents.send('reminder', alert);
    if (!mainWindow.isFocused()) mainWindow.flashFrame(true);
  }
}

function pauseReminders(option: PauseOption) {
  if (option === 'today') scheduler.pauseUntil(endOfToday());
  else if (typeof option === 'number' && option > 0 && option <= 24 * 60) scheduler.pauseUntil(Date.now() + option * 60_000);
  else throw new ValidationError('Duración de pausa no válida.');
  refreshTrayMenu();
}

// ---------------------------------------------------------------------------
// Bandeja del sistema y menú contextual del reloj
// ---------------------------------------------------------------------------

function reminderMenuItems(): MenuItemConstructorOptions[] {
  const st = scheduler.status();
  const paused = st.pausedUntil !== null;
  return [
    { label: 'Posponer recordatorio 15 min', enabled: st.enabled, click: () => scheduler.snooze(15) },
    { label: 'Posponer recordatorio 30 min', enabled: st.enabled, click: () => scheduler.snooze(30) },
    { type: 'separator' },
    { label: 'Pausar recordatorios 1 hora', enabled: st.enabled, click: () => pauseReminders(60) },
    { label: 'Pausar recordatorios el resto del día', enabled: st.enabled, click: () => pauseReminders('today') },
    { label: 'Reanudar recordatorios', enabled: paused, click: () => (scheduler.resume(), refreshTrayMenu()) },
  ];
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, process.platform === 'win32' ? 'tray.ico' : 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Gestor de Horas');
  tray.on('click', () => restoreMain());
  tray.on('double-click', () => restoreMain());
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Gestor de Horas', click: () => restoreMain() },
      { label: 'Minimizar a reloj flotante', click: () => toFloating() },
      { type: 'separator' },
      ...reminderMenuItems(),
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function showFloatingContextMenu() {
  if (!floatingWindow) return;
  Menu.buildFromTemplate([
    { label: 'Abrir imputación de horas', click: () => restoreMain() },
    { type: 'separator' },
    ...reminderMenuItems(),
    { type: 'separator' },
    {
      label: 'Salir de Gestor de Horas',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]).popup({ window: floatingWindow });
}

// ---------------------------------------------------------------------------
// Configuración con efectos secundarios
// ---------------------------------------------------------------------------

/** Tema claro/oscuro: también afecta a diálogos nativos y a prefers-color-scheme de las ventanas. */
function applyTheme(s: Settings) {
  nativeTheme.themeSource = s.theme;
  mainWindow?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b1120' : '#f6f7f9');
}

function applyAutoStart(enabled: boolean) {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
  } catch (e) {
    log.error('No se pudo configurar el inicio automático', e);
  }
}

function afterSettingsChanged(before: Settings, after: Settings) {
  if (
    before.remindersEnabled !== after.remindersEnabled ||
    before.reminderIntervalMinutes !== after.reminderIntervalMinutes
  ) {
    scheduler.restart();
    refreshTrayMenu();
  }
  if (before.autoStart !== after.autoStart) applyAutoStart(after.autoStart);
  if (before.theme !== after.theme) applyTheme(after);
  if (before.floatingPosition !== after.floatingPosition && floatingWindow) {
    const p = floatingPosition();
    floatingWindow.setPosition(p.x, p.y);
  }
  broadcast('settings:changed', after);
  if (before.maxDailyMinutes !== after.maxDailyMinutes || before.currentUserId !== after.currentUserId) {
    broadcast('data:changed');
  }
}

function updateSettings(patch: Partial<Settings>): Settings {
  const before = repo.getSettings();
  const after = repo.updateSettings(patch);
  afterSettingsChanged(before, after);
  return after;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function broadcast(channel: string, ...args: unknown[]) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  }
}

/** Solo se aceptan llamadas de nuestras propias páginas. */
function trustedSender(e: { senderFrame: Electron.WebFrameMain | null }): boolean {
  const url = e.senderFrame?.url ?? '';
  return url.startsWith('file://') || (!!DEV_URL && url.startsWith(DEV_URL));
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>, mutates = false) {
  ipcMain.handle(channel, async (e: IpcMainInvokeEvent, ...args: unknown[]): Promise<IpcResult<R>> => {
    if (!trustedSender(e)) return { ok: false, error: 'Origen no autorizado.' };
    try {
      const data = await fn(...(args as A));
      if (mutates) broadcast('data:changed');
      return { ok: true, data };
    } catch (err) {
      if (!(err instanceof ValidationError)) log.error(`IPC ${channel}`, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function on(channel: string, fn: (...args: never[]) => void) {
  ipcMain.on(channel, (e, ...args) => {
    if (!trustedSender(e)) return;
    try {
      (fn as (...a: unknown[]) => void)(...args);
    } catch (err) {
      log.error(`IPC ${channel}`, err);
    }
  });
}

function parentWindow(): BrowserWindow | undefined {
  return mainWindow && mainWindow.isVisible() ? mainWindow : undefined;
}

function registerIpc() {
  // App
  handle('app:info', () => ({
    version: app.getVersion(),
    dbPath,
    logPath,
    isPackaged: app.isPackaged,
    platform: process.platform,
  }));
  handle('app:openDataFolder', async () => {
    await shell.openPath(userData);
  });
  handle('app:logError', (message: string) => log.error(`Renderer: ${String(message).slice(0, 2000)}`));

  // Usuarios
  handle('users:list', () => repo.listUsers());
  handle('users:create', (name: string) => repo.createUser(name), true);
  handle('users:rename', (id: number, name: string) => repo.renameUser(id, name), true);

  // Proyectos
  handle('projects:list', (opts?: { includeInactive?: boolean; search?: string }) => repo.listProjects(opts ?? {}));
  handle('projects:create', (input: ProjectInput) => repo.createProject(input), true);
  handle('projects:update', (id: number, input: ProjectInput) => repo.updateProject(id, input), true);
  handle('projects:setActive', (id: number, active: boolean) => repo.setProjectActive(id, !!active), true);
  handle('projects:remove', (id: number) => repo.deleteProject(id), true);

  // Imputaciones
  handle('entries:day', (userId: number, date: string) => repo.day(userId, date));
  handle('entries:create', (input: EntryInput) => repo.createEntry(input), true);
  handle('entries:update', (id: number, input: EntryInput) => repo.updateEntry(id, input), true);
  handle('entries:remove', (id: number) => repo.deleteEntry(id), true);
  handle('entries:history', (filter: HistoryFilter) => repo.history(filter ?? {}));
  handle('entries:stats', (filter: HistoryFilter, distribution?: SharedDistribution) =>
    repo.stats(filter ?? {}, todayIso(), distribution === 'proportional' || distribution === 'equal' ? distribution : 'none'),
  );
  handle('entries:last', (userId: number) => repo.lastEntry(userId));
  handle('entries:registerAbsence', (input: AbsenceInput) => repo.registerAbsence(input), true);
  handle('entries:exportHistory', async (filter: HistoryFilter, format: 'xlsx' | 'csv') => {
    if (format !== 'xlsx' && format !== 'csv') throw new ValidationError('Formato no válido.');
    const { rows, totalMinutes } = repo.history(filter ?? {});
    if (rows.length === 0) throw new ValidationError('No hay registros que exportar con los filtros actuales.');
    const opts = {
      title: 'Exportar histórico',
      defaultPath: path.join(app.getPath('documents'), `imputaciones-${todayIso()}.${format}`),
      filters:
        format === 'xlsx' ? [{ name: 'Libro de Excel', extensions: ['xlsx'] }] : [{ name: 'CSV', extensions: ['csv'] }],
    };
    const parent = parentWindow();
    const res = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return null;
    if (format === 'xlsx') fs.writeFileSync(res.filePath, toXlsx(rows, totalMinutes));
    else fs.writeFileSync(res.filePath, toCsv(rows), 'utf8');
    log.info(`Histórico exportado a ${res.filePath}`);
    return res.filePath;
  });

  // Configuración
  handle('settings:get', () => repo.getSettings());
  handle('settings:update', (patch: Partial<Settings>) => updateSettings(patch));
  handle('settings:reset', () => {
    const before = repo.getSettings();
    const after = repo.resetSettings();
    afterSettingsChanged(before, after);
    return after;
  });

  // Recordatorios
  handle('reminders:status', () => scheduler.status());
  handle('reminders:snooze', (minutes: number) => {
    if (typeof minutes !== 'number' || minutes <= 0 || minutes > 24 * 60) throw new ValidationError('Duración no válida.');
    scheduler.snooze(minutes);
    refreshTrayMenu();
    return scheduler.status();
  });
  handle('reminders:pause', (option: PauseOption) => {
    pauseReminders(option);
    return scheduler.status();
  });
  handle('reminders:resume', () => {
    scheduler.resume();
    refreshTrayMenu();
    return scheduler.status();
  });
  handle('reminders:test', () => fireReminder());

  // Copias de seguridad
  handle('backup:export', async () => {
    const opts = {
      title: 'Exportar copia de seguridad',
      defaultPath: path.join(app.getPath('documents'), `gestor-horas-copia-${todayIso()}.sqlite`),
      filters: [{ name: 'Copia de seguridad', extensions: ['sqlite'] }],
    };
    const parent = parentWindow();
    const res = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return null;
    exportBackup(store, res.filePath);
    log.info(`Copia exportada a ${res.filePath}`);
    return res.filePath;
  });
  handle('backup:import', async () => {
    const parent = parentWindow();
    const openOpts: Electron.OpenDialogOptions = {
      title: 'Importar copia de seguridad',
      properties: ['openFile'],
      filters: [{ name: 'Copia de seguridad', extensions: ['sqlite', 'db', 'sqlite3'] }],
    };
    const res = parent ? await dialog.showOpenDialog(parent, openOpts) : await dialog.showOpenDialog(openOpts);
    if (res.canceled || !res.filePaths[0]) return false;
    const confirmOpts: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: ['Cancelar', 'Importar y sustituir'],
      defaultId: 0,
      cancelId: 0,
      title: 'Importar copia de seguridad',
      message: 'Se sustituirán TODOS los datos actuales por los de la copia.',
      detail: `Antes de importar se guardará automáticamente una copia de los datos actuales en:\n${backupDir}`,
    };
    const confirm = parent ? await dialog.showMessageBox(parent, confirmOpts) : await dialog.showMessageBox(confirmOpts);
    if (confirm.response !== 1) return false;
    const before = repo.getSettings();
    importBackup(store, res.filePaths[0], backupDir);
    log.info(`Copia importada desde ${res.filePaths[0]}`);
    afterSettingsChanged(before, repo.getSettings());
    scheduler.restart();
    broadcast('data:changed');
    return true;
  });

  // Ventanas
  handle('window:toFloating', () => toFloating());

  // Reloj flotante
  handle('floating:summary', () => {
    const s = repo.getSettings();
    return s.currentUserId ? repo.daySummary(s.currentUserId, todayIso()) : null;
  });
  on('floating:setIgnoreMouse', (ignore: boolean) => {
    floatingWindow?.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  on('floating:dragStart', () => {
    if (!floatingWindow) return;
    const [x, y] = floatingWindow.getPosition();
    dragOrigin = { x, y };
  });
  on('floating:dragMove', (dx: number, dy: number) => {
    if (!floatingWindow || !dragOrigin || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    floatingWindow.setPosition(Math.round(dragOrigin.x + dx), Math.round(dragOrigin.y + dy));
  });
  on('floating:dragEnd', () => {
    if (!floatingWindow || !dragOrigin) return;
    dragOrigin = null;
    const [x, y] = floatingWindow.getPosition();
    updateSettings({ floatingPosition: 'custom', floatingX: x, floatingY: y });
  });
  on('floating:click', () => restoreMain());
  on('floating:contextMenu', () => showFloatingContextMenu());
}
