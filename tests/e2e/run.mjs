// Prueba end-to-end de la aplicación Electron real (requiere `npm run build` previo).
// Uso: node tests/e2e/run.mjs   (en Linux sin pantalla: xvfb-run -a node tests/e2e/run.mjs)
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// E2E_EXECUTABLE permite probar la aplicación ya instalada (p. ej. "/opt/Gestor de Horas/gestor-horas").
const packagedExe = process.env.E2E_EXECUTABLE || null;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-e2e-'));
// Configuración XDG aislada (el inicio automático de Linux escribe en ~/.config/autostart).
const xdgConfig = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-e2e-xdg-'));
const hasXdotool = (() => {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('xdotool', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const xdo = (...a) => execFileSync('xdotool', a.map(String));
const shots = path.resolve('tests/e2e/screenshots');
fs.mkdirSync(shots, { recursive: true });
const args = [...(packagedExe ? [] : ['.']), ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])];
const results = [];

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(`  ✔ ${name} (${Date.now() - t} ms)`);
    console.log(results.at(-1));
  } catch (e) {
    console.log(`  ✘ ${name}\n${e.stack}`);
    throw e;
  }
}

async function launch() {
  const app = await electron.launch({
    executablePath: packagedExe ?? electronPath,
    args,
    env: { ...process.env, GESTOR_USER_DATA: userData, XDG_CONFIG_HOME: xdgConfig },
  });
  const main = await app.firstWindow();
  await main.waitForLoadState('domcontentloaded');
  return { app, main };
}

const winState = (app, page) =>
  app.evaluate(({ BrowserWindow }, title) => {
    return BrowserWindow.getAllWindows().map((w) => ({
      title: w.getTitle(),
      url: w.webContents.getURL(),
      visible: w.isVisible(),
      onTop: w.isAlwaysOnTop(),
      bounds: w.getBounds(),
    }));
  }, page);

const floatingPage = async (app) => {
  for (let i = 0; i < 50; i++) {
    const p = app.windows().find((w) => w.url().includes('floating.html'));
    if (p) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('No apareció la ventana del reloj flotante');
};

let { app, main } = await launch();
console.log('E2E Gestor de Horas –', packagedExe ? `app instalada: ${packagedExe}` : 'código fuente', '– datos en', userData);

await step('Primer uso: pide el nombre y lo recuerda', async () => {
  await main.getByText('Bienvenido a Gestor de Horas').waitFor();
  await main.screenshot({ path: path.join(shots, '01-primer-uso.png') });
  await main.getByPlaceholder('Nombre y apellidos').fill('Alejandro Jiménez');
  await main.getByRole('button', { name: 'Empezar' }).click();
  await main.getByText('Alejandro Jiménez').first().waitFor();
});

await step('Gestión de proyectos: crear, código duplicado, desactivar', async () => {
  await main.getByRole('button', { name: 'Proyectos' }).click();
  for (const [code, name] of [
    ['AYS-001', 'Portal de clientes'],
    ['AYS-002', 'Integración SAP'],
    ['AYS-003', 'Proyecto antiguo'],
  ]) {
    await main.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await main.getByPlaceholder('p. ej. PRJ-2026-014').fill(code);
    await main.getByPlaceholder('p. ej. Portal de clientes').fill(name);
    await main.getByRole('button', { name: 'Crear proyecto' }).click();
    await main.getByRole('cell', { name, exact: true }).waitFor();
  }
  await main.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await main.getByPlaceholder('p. ej. PRJ-2026-014').fill('ays-001');
  await main.getByPlaceholder('p. ej. Portal de clientes').fill('Duplicado');
  await main.getByRole('button', { name: 'Crear proyecto' }).click();
  await main.getByText('ya está en uso').waitFor();
  await main.getByRole('button', { name: 'Cancelar' }).click();
  const row = main.getByRole('row', { name: /Proyecto antiguo/ });
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await row.getByText('Inactivo').waitFor();
  await main.screenshot({ path: path.join(shots, '02-proyectos.png') });
});

await step('Imputar horas: guardar y actualizar resumen del día', async () => {
  await main.getByRole('button', { name: 'Imputar horas' }).click();
  const projectSelect = main.locator('select').nth(1);
  const options = await projectSelect.locator('option').allTextContents();
  assert.ok(!options.some((o) => o.includes('Proyecto antiguo')), 'un proyecto inactivo no debe aparecer');
  await projectSelect.selectOption({ label: 'Portal de clientes' });
  await main.getByRole('button', { name: 'Desarrollo' }).click();
  await main.getByRole('button', { name: '4,00' }).click();
  await main.getByPlaceholder('Opcional').fill('Desarrollo del módulo de login');
  await main.getByRole('button', { name: 'Guardar imputación' }).click();
  await main.getByText('Imputación guardada').last().waitFor();
  await main.getByText('48,48 %').waitFor(); // 4 / 8,25
  // Segunda imputación usando "Resto" → completa la jornada
  await projectSelect.selectOption({ label: 'Integración SAP' });
  await main.getByRole('button', { name: 'Incidencia' }).click();
  await main.getByRole('button', { name: /Resto · 4,25/ }).click();
  await main.getByRole('button', { name: 'Guardar imputación' }).click();
  await main.getByText('Día completado').waitFor();
  await main.getByText('100,00 %').waitFor();
  await main.screenshot({ path: path.join(shots, '03-imputar-completo.png') });
});

await step('Backend impide superar el máximo diario y múltiplos de 15', async () => {
  const errs = await main.evaluate(async () => {
    const s = await window.api.settings.get();
    const [p] = await window.api.projects.list();
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const out = [];
    for (const minutes of [15, 20]) {
      try {
        await window.api.entries.create({ userId: s.currentUserId, projectId: p.id, date, minutes, workType: 'desarrollo' });
        out.push('OK');
      } catch (e) {
        out.push(e.message);
      }
    }
    return out;
  });
  assert.match(errs[0], /completa/);
  assert.match(errs[1], /múltiplos|mínimo/);
});

await step('Editar imputación teniendo en cuenta su valor anterior', async () => {
  const item = main.locator('li', { hasText: 'Integración SAP' });
  await item.hover();
  await item.getByRole('button', { name: 'Editar' }).click();
  await main.getByText('Editando la imputación').waitFor();
  await main.getByRole('button', { name: 'Restar 15 minutos' }).click();
  await main.getByRole('button', { name: 'Guardar cambios' }).click();
  await main.getByText('Cambios guardados').last().waitFor();
  await main.getByText('Pendiente', { exact: true }).waitFor();
});

await step('Histórico: tabla, filtros, total y día anterior', async () => {
  // Imputación en un día anterior
  await main.getByRole('button', { name: 'Día anterior' }).click();
  await main.locator('select').nth(1).selectOption({ label: 'Portal de clientes' });
  await main.getByRole('button', { name: 'Mantenimiento' }).click();
  await main.getByRole('button', { name: '2,00' }).click();
  await main.getByRole('button', { name: 'Guardar imputación' }).click();
  await main.getByText('Imputación guardada').last().waitFor();

  await main.getByRole('button', { name: 'Histórico' }).click();
  await main.getByText('3 registro(s)').waitFor();
  await main.getByText('10,00 h').waitFor();
  await main.screenshot({ path: path.join(shots, '04-historico.png') });
  await main.getByPlaceholder('Buscar proyecto…').fill('SAP');
  await main.getByText('1 registro(s)').waitFor();
  await main.getByRole('button', { name: 'Limpiar filtros' }).click();
  await main.getByLabel('Filtrar por tipo').selectOption('mantenimiento');
  await main.getByText('2,00 h').first().waitFor();
  await main.getByRole('button', { name: 'Limpiar filtros' }).click();
  // Eliminar con confirmación
  const row = main.getByRole('row', { name: /Mantenimiento/ });
  await row.hover();
  await row.getByRole('button', { name: 'Eliminar' }).click();
  await main.getByRole('dialog', { name: 'Eliminar imputación' }).getByRole('button', { name: 'Eliminar' }).click();
  await main.getByText('2 registro(s)').waitFor();
});

await step('Configuración visible y recordatorio cada 1 minuto', async () => {
  await main.getByRole('button', { name: 'Configuración' }).click();
  await main.getByText('Horarios y jornada').waitFor();
  await main.screenshot({ path: path.join(shots, '05-configuracion.png'), fullPage: true });
  // Intervalo personalizado de 1 minuto para probar el temporizador real
  await main.evaluate(() => window.api.settings.update({ reminderIntervalMinutes: 1, skipRemindersWhenComplete: false }));
});

let floating;
await step('Minimizar a reloj flotante: ventana independiente, siempre encima', async () => {
  await main.getByRole('button', { name: 'Imputar horas' }).click();
  await main.getByRole('button', { name: 'Minimizar a reloj flotante' }).click();
  floating = await floatingPage(app);
  await floating.getByTestId('floating-clock').waitFor();
  await new Promise((r) => setTimeout(r, 400));
  const ws = await winState(app);
  const mainW = ws.find((w) => w.url.includes('index.html'));
  const floatW = ws.find((w) => w.url.includes('floating.html'));
  assert.equal(mainW.visible, false, 'la ventana principal debe ocultarse');
  assert.equal(floatW.visible, true, 'el reloj debe verse');
  assert.equal(floatW.onTop, true, 'el reloj debe estar siempre encima');
  assert.ok(floatW.bounds.width <= 100 && floatW.bounds.height <= 100, 'el reloj debe ser pequeño');
});

await step('El recordatorio salta por temporizador con la ventana oculta (espera real ~1 min)', async () => {
  await floating.locator('.animate-ping').waitFor({ timeout: 75_000 });
  const html = await floating.content();
  assert.ok(html.includes('animate-ping'));
  await floating.screenshot({ path: path.join(shots, '06-reloj-aviso.png') });
});

await step('Arrastrar el reloj y recordar posición', async () => {
  const before = (await winState(app)).find((w) => w.url.includes('floating.html')).bounds;
  await app.evaluate(({ ipcMain }) => {
    // Simula la secuencia de arrastre que envía el renderer.
    ipcMain.emit('floating:dragStart', { senderFrame: { url: 'file://x' } });
    ipcMain.emit('floating:dragMove', { senderFrame: { url: 'file://x' } }, -120, -80);
    ipcMain.emit('floating:dragEnd', { senderFrame: { url: 'file://x' } });
  });
  const after = (await winState(app)).find((w) => w.url.includes('floating.html')).bounds;
  assert.equal(after.x, before.x - 120);
  assert.equal(after.y, before.y - 80);
  const s = await main.evaluate(() => window.api.settings.get());
  assert.equal(s.floatingPosition, 'custom');
  assert.equal(s.floatingX, after.x);
});

if (hasXdotool) {
  await step('Linux: las esquinas transparentes del reloj dejan pasar los clics (clics reales de X11)', async () => {
    const b = (await winState(app)).find((w) => w.url.includes('floating.html')).bounds;
    // Identificador X11 de la ventana del reloj y ventana real bajo el puntero en cada punto.
    const xid = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('floating'));
      const h = w.getNativeWindowHandle();
      return h.length >= 8 ? Number(h.readBigUInt64LE(0)) : h.readUInt32LE(0);
    });
    const windowAt = (x, y) => {
      xdo('mousemove', x, y);
      const out = execFileSync('xdotool', ['getmouselocation', '--shell']).toString();
      return Number(/WINDOW=(\d+)/.exec(out)[1]);
    };
    assert.equal(windowAt(b.x + b.width / 2, b.y + b.height / 2), xid, 'el centro pertenece al reloj');
    for (const [x, y] of [
      [b.x + 2, b.y + 2],
      [b.x + b.width - 3, b.y + 2],
      [b.x + 2, b.y + b.height - 3],
      [b.x + b.width - 3, b.y + b.height - 3],
    ]) {
      assert.notEqual(windowAt(x, y), xid, `la esquina (${x - b.x}, ${y - b.y}) debe dejar pasar el clic`);
    }
    // Esquina superior izquierda: fuera del círculo → el clic no llega al reloj.
    xdo('mousemove', b.x + 3, b.y + 3);
    xdo('click', 1);
    await new Promise((r) => setTimeout(r, 600));
    let ws = await winState(app);
    assert.equal(ws.find((w) => w.url.includes('index.html')).visible, false, 'el clic en la esquina no debe abrir la app');
    // Centro: es el reloj → abre la ventana de imputación.
    xdo('mousemove', b.x + b.width / 2, b.y + b.height / 2);
    xdo('click', 1);
    await new Promise((r) => setTimeout(r, 800));
    ws = await winState(app);
    assert.equal(ws.find((w) => w.url.includes('index.html')).visible, true, 'el clic en el reloj abre la app');
    assert.equal(ws.find((w) => w.url.includes('floating.html')).visible, false);
    // Se deja como estaba para el siguiente paso.
    await main.getByRole('button', { name: 'Minimizar a reloj flotante' }).click();
    await new Promise((r) => setTimeout(r, 500));
  });
}

await step('Clic en el reloj restaura la ventana de imputación', async () => {
  await floating.getByTestId('floating-clock').click();
  await new Promise((r) => setTimeout(r, 500));
  const ws = await winState(app);
  assert.equal(ws.find((w) => w.url.includes('index.html')).visible, true);
  assert.equal(ws.find((w) => w.url.includes('floating.html')).visible, false);
});

await step('Minimizar la ventana muestra el reloj y cerrar la oculta en bandeja', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index'))?.minimize());
  await new Promise((r) => setTimeout(r, 500));
  let ws = await winState(app);
  assert.equal(ws.find((w) => w.url.includes('floating.html')).visible, true);
  await main.evaluate(() => window.api.reminders.status()); // la app sigue viva
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index'));
    w.restore();
    w.show();
  });
  await new Promise((r) => setTimeout(r, 300));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index'))?.close());
  await new Promise((r) => setTimeout(r, 300));
  ws = await winState(app);
  assert.equal(ws.find((w) => w.url.includes('index.html')).visible, false, 'cerrar oculta en la bandeja');
  assert.equal(ws.find((w) => w.url.includes('floating.html')).visible, true);
});

await step('Persistencia tras cerrar y volver a abrir la aplicación', async () => {
  await app.evaluate(({ app }) => app.quit());
  await new Promise((r) => setTimeout(r, 800));
  ({ app, main } = await launch());
  await main.getByText('Alejandro Jiménez').first().waitFor();
  const count = await main.locator('text=Bienvenido a Gestor de Horas').count();
  assert.equal(count, 0, 'no debe volver a pedir el nombre');
  const h = await main.evaluate(() => window.api.entries.history({}));
  assert.equal(h.rows.length, 2);
  const s = await main.evaluate(() => window.api.settings.get());
  assert.equal(s.reminderIntervalMinutes, 1);
  assert.equal(s.floatingPosition, 'custom');
  assert.ok(fs.existsSync(path.join(userData, 'gestor-horas.sqlite')));
  assert.ok(fs.existsSync(path.join(userData, 'copias-seguridad')), 'copia automática diaria');
  await main.screenshot({ path: path.join(shots, '07-tras-reinicio.png') });
});

await step('Proyecto especial de Vacaciones desde «Proyectos»', async () => {
  await main.getByRole('button', { name: 'Proyectos' }).click();
  await main.getByText('Tareas comunes (todos)').waitFor();
  await main.getByRole('button', { name: 'Configurar Vacaciones' }).click();
  await main.waitForFunction(
    (v) => document.querySelector('input[placeholder="p. ej. Portal de clientes"]')?.value === v,
    'Vacaciones',
  );
  await main.getByRole('button', { name: 'Crear proyecto' }).click();
  await main.getByText('Vacaciones · 0 imputación(es)').waitFor();
  await main.screenshot({ path: path.join(shots, '08-proyectos-especiales.png') });
});

await step('Registrar vacaciones en un rango (salta fines de semana)', async () => {
  await main.getByRole('button', { name: 'Imputar horas', exact: true }).click();
  await main.getByRole('button', { name: 'Registrar ausencia' }).click();
  const dlg = main.getByRole('dialog', { name: 'Registrar ausencia' });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date();
  start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7)); // próximo lunes
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // domingo
  await dlg.locator('input[type="date"]').nth(0).fill(iso(start));
  await dlg.locator('input[type="date"]').nth(1).fill(iso(end));
  await dlg.getByText('5 día(s) laborable(s)').waitFor();
  await main.screenshot({ path: path.join(shots, '09-ausencia.png') });
  await dlg.getByRole('button', { name: /Registrar 5 día/ }).click();
  await main.getByText('Vacaciones registradas').waitFor();
  const h = await main.evaluate(() => window.api.entries.history({ workType: 'ausencia' }));
  assert.equal(h.rows.length, 5);
  assert.ok(h.rows.every((r) => r.minutes === 495 && r.projectKind === 'vacation'));
});

await step('Duplicar una tarea, cambiar el proyecto y guardarla como nueva', async () => {
  const before = (await main.evaluate(() => window.api.entries.history({}))).rows.length;
  const item = main.locator('li', { hasText: 'Portal de clientes' }).first();
  await item.hover();
  await item.getByRole('button', { name: 'Duplicar como nueva' }).click();
  await main.getByText('Copia de').waitFor();
  await main.locator('select').nth(1).selectOption({ label: 'Integración SAP' });
  await main.getByRole('button', { name: 'Guardar imputación' }).click();
  await main.getByText('Imputación guardada').last().waitFor();
  const after = await main.evaluate(() => window.api.entries.history({}));
  assert.equal(after.rows.length, before + 1);
  assert.equal(after.rows.filter((r) => r.projectName === 'Integración SAP').length, 2);
  // «Repetir última tarea» copia la recién creada
  await main.getByRole('button', { name: 'Repetir última tarea' }).click();
  await main.getByText('Copia de').waitFor();
  await main.getByRole('button', { name: 'Descartar' }).click();
});

await step('Estadísticas: horas por proyecto, % y cobertura', async () => {
  await main.getByRole('button', { name: 'Histórico' }).click();
  await main.getByRole('tab', { name: 'Estadísticas' }).click();
  await main.getByText('Horas por proyecto').waitFor();
  await main.getByText('Cobertura de la jornada').waitFor();
  await main.getByText('Evolución diaria').waitFor();
  await main.getByLabel('Periodo').selectOption('thisYear');
  await main.getByText('Total trabajo').waitFor();
  const st = await main.evaluate(() => window.api.entries.stats({ dateFrom: '2000-01-01', dateTo: '2100-01-01' }));
  assert.ok(st.byProject.length >= 2);
  assert.equal(st.vacationDays, 5);
  await main.waitForTimeout(300);
  await main.screenshot({ path: path.join(shots, '10-estadisticas.png'), fullPage: true });
});

await step('Tarea común a todos los proyectos: se imputa una vez y se reparte solo en estadísticas', async () => {
  await main.getByRole('button', { name: 'Proyectos' }).click();
  await main.getByRole('button', { name: 'Configurar tareas comunes' }).click();
  await main.waitForFunction(
    (v) => document.querySelector('input[placeholder="p. ej. Portal de clientes"]')?.value === v,
    'Todos los proyectos',
  );
  await main.getByRole('button', { name: 'Crear proyecto' }).click();
  await main.getByText('Todos los proyectos · 0 imputación(es)').waitFor();

  await main.getByRole('button', { name: 'Imputar horas', exact: true }).click();
  await main.getByRole('button', { name: 'Día anterior' }).click();
  await main.locator('select').nth(1).selectOption({ label: '🌐 Todos los proyectos (tarea común)' });
  await main.getByText('Tarea común a todos los proyectos.').waitFor();
  await main.getByRole('button', { name: 'Mantenimiento', exact: true }).click();
  await main.getByRole('button', { name: '1,00' }).click();
  await main.getByPlaceholder('Opcional').fill('Reunión de equipo de todos los proyectos');
  await main.screenshot({ path: path.join(shots, '13-tarea-comun.png') });
  await main.getByRole('button', { name: 'Guardar imputación' }).click();
  await main.getByText('Imputación guardada').last().waitFor();
  const stored = await main.evaluate(() => window.api.entries.history({ search: 'Todos los proyectos' }));
  assert.equal(stored.rows.length, 1, 'se guarda un único registro');
  assert.equal(stored.rows[0].minutes, 60);

  await main.getByRole('button', { name: 'Histórico' }).click();
  await main.getByRole('tab', { name: 'Estadísticas' }).click();
  await main.getByLabel('Periodo').selectOption('thisYear');
  await main.getByText('de tareas comunes').waitFor();
  await main.getByRole('radio', { name: 'Proporcional' }).click();
  await main.getByText(/Repartido entre \d+ proyecto/).waitFor();
  const [none, prop, eq] = await main.evaluate(async () => {
    const t = new Date();
    const f = { dateFrom: `${t.getFullYear()}-01-01`, dateTo: `${t.getFullYear()}-12-31` };
    return Promise.all(['none', 'proportional', 'equal'].map((d) => window.api.entries.stats(f, d)));
  });
  const sumWork = (s) => s.byProject.filter((p) => p.kind === 'normal' || p.kind === 'shared').reduce((a, p) => a + p.minutes, 0);
  assert.ok(Math.abs(sumWork(none) - sumWork(prop)) < 1e-6, 'el total cuadra al repartir');
  assert.ok(Math.abs(sumWork(none) - sumWork(eq)) < 1e-6);
  assert.ok(!prop.byProject.some((p) => p.kind === 'shared'));
  await main.waitForTimeout(300);
  await main.screenshot({ path: path.join(shots, '14-reparto.png') });
  await main.getByRole('radio', { name: 'Sin repartir' }).click();
});

if (packagedExe && process.platform === 'linux') {
  await step('Linux: «Iniciar al abrir la sesión» crea y elimina la entrada de autoarranque', async () => {
    const file = path.join(xdgConfig, 'autostart', 'gestor-horas.desktop');
    await main.evaluate(() => window.api.settings.update({ autoStart: true }));
    await new Promise((r) => setTimeout(r, 300));
    const txt = fs.readFileSync(file, 'utf8');
    assert.match(txt, /^Exec=".+" --hidden$/m);
    if (process.env.APPIMAGE_EXTRACT_AND_RUN) assert.match(txt, /\.AppImage" --hidden$/m, "en AppImage debe apuntar al fichero .AppImage");
    assert.match(txt, /Type=Application/);
    await main.evaluate(() => window.api.settings.update({ autoStart: false }));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(fs.existsSync(file), false);
  });
}

await step('Rutinas: crear desde la interfaz e imputar con un clic', async () => {
  await main.getByRole('button', { name: 'Imputar horas', exact: true }).click();
  // Un lunes libre dentro de unas semanas (no laborable/ausencias de pasos anteriores no interfieren).
  const date = await main.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 21 + ((8 - d.getDay()) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await main.locator('input[type="date"]').first().fill(date);
  await main.getByRole('button', { name: 'Nueva rutina' }).click();
  const dlg = main.getByRole('dialog', { name: 'Nueva rutina' });
  await dlg.getByPlaceholder('p. ej. Tareas de cada mañana').fill('Mañanas');
  await dlg.getByLabel('Proyecto de la tarea 1').selectOption({ index: 1 });
  await dlg.getByLabel('Tipo de la tarea 1').selectOption('mantenimiento');
  await dlg.getByLabel('Descripción de la tarea 1').fill('Revisar correo');
  await dlg.getByRole('button', { name: 'Añadir tarea' }).click();
  await dlg.getByLabel('Proyecto de la tarea 2').selectOption({ index: 1 });
  await dlg.getByLabel('Tipo de la tarea 2').selectOption('incidencia');
  await dlg.getByRole('group', { name: 'Horas' }).nth(1).getByRole('button', { name: 'Sumar 15 minutos' }).click();
  await main.screenshot({ path: path.join(shots, '13-rutina-editor.png') });
  await dlg.getByRole('button', { name: 'Guardar rutina' }).click();
  await main.getByText('Rutina «Mañanas» creada').waitFor();
  await main.getByRole('button', { name: 'Imputar', exact: true }).click();
  await main.getByText('Rutina «Mañanas» aplicada').waitFor();
  const day = await main.evaluate(
    ([d]) => window.api.settings.get().then((s) => window.api.entries.day(s.currentUserId, d)),
    [date],
  );
  assert.equal(day.entries.length, 2);
  assert.equal(day.summary.imputedMinutes, 60 + 75);
  // Volver a imputar pide confirmación.
  await main.getByRole('button', { name: 'Imputar', exact: true }).click();
  await main.getByRole('dialog', { name: 'Aplicar de nuevo' }).getByRole('button', { name: 'Cancelar' }).click();
  await main.waitForTimeout(300);
  await main.screenshot({ path: path.join(shots, '14-rutinas.png') });
});

await step('Horarios: viernes 7 h y horario de verano por fechas', async () => {
  await main.getByRole('button', { name: 'Configuración' }).click();
  await main.getByText('Horarios y jornada').waitFor();
  for (let i = 0; i < 5; i++) await main.getByRole('button', { name: 'Restar 15 minutos el Viernes' }).first().click();
  await main.getByRole('button', { name: 'Añadir horario' }).click();
  await main.getByRole('button', { name: /^Verano: L-V 7 h/ }).click();
  await main.getByRole('button', { name: 'Guardar horarios' }).click();
  await main.getByText('Horarios guardados').waitFor();
  const s = await main.evaluate(() => window.api.settings.get());
  assert.equal(s.schedules.length, 2);
  assert.deepEqual(s.schedules[0].minutes.slice(1, 6), [495, 495, 495, 495, 420]);
  assert.deepEqual(s.schedules[1].period, { from: '06-15', to: '09-15' });
  // 2027-01-15 es viernes; 2027-07-14 es miércoles en verano.
  const [fri, summer, mon] = await main.evaluate((uid) =>
    Promise.all(['2027-01-15', '2027-07-14', '2027-01-11'].map((d) => window.api.entries.day(uid, d))),
    s.currentUserId,
  );
  assert.equal(fri.summary.maxMinutes, 420);
  assert.equal(summer.summary.maxMinutes, 420);
  assert.equal(mon.summary.maxMinutes, 495);
  await main.getByText('Horarios y jornada').scrollIntoViewIfNeeded();
  await main.screenshot({ path: path.join(shots, '15-horarios.png') });
});

await step('Apariencia: paleta, fondo de pantalla, cristal y color libre', async () => {
  await main.getByRole('button', { name: 'Configuración' }).click();
  await main.getByRole('radio', { name: /Cálida/ }).click();
  await main.waitForFunction(() => document.documentElement.dataset.palette === 'warm');
  await main.getByRole('radio', { name: 'Aurora' }).click();
  await main.locator('body > #root .app-wallpaper[data-wp="aurora"]').first().waitFor({ state: 'attached' });
  await main.getByRole('switch', { name: 'Paneles de cristal' }).click();
  await main.waitForFunction(() => document.documentElement.dataset.glass === 'true');
  await main.getByLabel('Color personalizado').fill('#0f9d8a');
  await main.waitForFunction(() => document.documentElement.dataset.accent === 'custom');
  const s = await main.evaluate(() => window.api.settings.get());
  assert.equal(s.customAccent, '#0f9d8a');
  await main.evaluate(() => window.scrollTo(0, 0));
  await main.waitForTimeout(300);
  await main.screenshot({ path: path.join(shots, '16-apariencia.png') });
  await main.getByRole('button', { name: 'Imputar horas', exact: true }).click();
  await main.waitForTimeout(300);
  await main.screenshot({ path: path.join(shots, '17-fondo-imputar.png') });
});

await step('Modo noche y color de acento', async () => {
  await main.getByRole('button', { name: 'Cambiar entre modo claro y modo noche' }).click();
  await main.waitForFunction(() => document.documentElement.classList.contains('dark'));
  const s = await main.evaluate(() => window.api.settings.get());
  assert.equal(s.theme, 'dark');
  await main.getByRole('button', { name: 'Configuración' }).click();
  await main.getByRole('radio', { name: 'Violeta' }).click();
  await main.waitForFunction(() => document.documentElement.dataset.accent === 'violet');
  await main.waitForTimeout(300);
  await main.screenshot({ path: path.join(shots, '11-modo-noche.png') });
  await main.getByRole('button', { name: 'Imputar horas', exact: true }).click();
  await main.waitForTimeout(300);
  await main.screenshot({ path: path.join(shots, '12-modo-noche-imputar.png') });
});

await app.evaluate(({ app }) => app.quit());
console.log(`\nE2E OK – ${results.length} pasos superados. Capturas en ${shots}`);
process.exit(0);
