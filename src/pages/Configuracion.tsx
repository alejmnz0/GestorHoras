/**
 * Configuración: apariencia, usuario, horarios, recordatorios, sonido, reloj flotante, sistema y datos.
 * Cada cambio se guarda al momento.
 */
import {
  AlarmClock,
  CalendarClock,
  BellOff,
  Database,
  Download,
  FolderOpen,
  MonitorDown,
  Palette,
  Play,
  RotateCcw,
  Timer,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  MAX_REMINDER_MINUTES,
  REMINDER_PRESETS,
} from '../../shared/rules';
import type { AppInfo, FloatingPosition, ReminderStatus, Settings } from '../../shared/types';
import { AppearanceSettings } from '../components/AppearanceSettings';
import { ScheduleSettings } from '../components/ScheduleSettings';
import { Row, Section } from '../components/SettingsLayout';
import { useToast } from '../components/Toast';
import { Button, ConfirmDialog, PageHeader, Toggle, cx, inputClass } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/appContext';
import { playChime } from '../lib/sound';

export function ConfiguracionPage({ onAddUser }: { onAddUser: () => void }) {
  const { settings, users, updateSettings, reloadUsers } = useApp();
  const toast = useToast();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [userName, setUserName] = useState('');
  const [customInterval, setCustomInterval] = useState(String(settings.reminderIntervalMinutes));
  const [confirmReset, setConfirmReset] = useState(false);
  const [now, setNow] = useState(Date.now());

  const currentUser = users.find((u) => u.id === settings.currentUserId);
  const isPreset = (REMINDER_PRESETS as readonly number[]).includes(settings.reminderIntervalMinutes);
  const [customMode, setCustomMode] = useState(!isPreset);

  useEffect(() => {
    api.app.info().then(setInfo);
    api.reminders.status().then(setStatus);
    const off = api.on.reminderStatus(setStatus);
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);
  useEffect(() => setUserName(currentUser?.name ?? ''), [currentUser?.name]);
  useEffect(() => setCustomInterval(String(settings.reminderIntervalMinutes)), [settings.reminderIntervalMinutes]);

  const save = async (patch: Partial<Settings>, okMsg?: string) => {
    try {
      await updateSettings(patch);
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error('No se pudo guardar', errorMessage(e));
    }
  };

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error('Error', errorMessage(e));
    }
  };

  async function renameUser() {
    if (!currentUser || userName.trim() === currentUser.name) return;
    try {
      await api.users.rename(currentUser.id, userName);
      await reloadUsers();
      toast.success('Nombre actualizado');
    } catch (e) {
      toast.error('No se pudo cambiar el nombre', errorMessage(e));
      setUserName(currentUser.name);
    }
  }

  const time = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const statusText = !settings.remindersEnabled
    ? 'Recordatorios desactivados.'
    : status?.pausedUntil
      ? `En pausa hasta las ${time(status.pausedUntil)}.`
      : status?.nextAt
        ? `Próximo aviso a las ${time(status.nextAt)} (en ${Math.max(0, Math.ceil((status.nextAt - now) / 60_000))} min).`
        : '—';

  return (
    <div className="fade-in max-w-3xl">
      <PageHeader title="Configuración" subtitle="Los cambios se guardan automáticamente." />

      <div className="space-y-5">
        <Section
          title="Apariencia"
          description="Modo claro u oscuro, colores, paletas y fondos de pantalla."
          icon={<Palette className="size-4" />}
        >
          <AppearanceSettings settings={settings} save={save} />
        </Section>

        <Section title="Usuario" description="Se recuerda automáticamente; no hace falta indicarlo en cada imputación.">
          <Row label="Usuario actual">
            <select
              className={cx(inputClass, 'w-64!')}
              value={settings.currentUserId ?? ''}
              onChange={(e) => {
                if (e.target.value === '__new__') onAddUser();
                else void save({ currentUserId: Number(e.target.value) }, 'Usuario cambiado');
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              <option value="__new__">+ Nuevo usuario…</option>
            </select>
          </Row>
          <Row label="Nombre del usuario">
            <div className="flex gap-2">
              <input
                className={cx(inputClass, 'w-64!')}
                value={userName}
                maxLength={80}
                onChange={(e) => setUserName(e.target.value)}
                onBlur={renameUser}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              />
              <Button icon={<UserPlus className="size-4" />} onClick={onAddUser}>
                Añadir
              </Button>
            </div>
          </Row>
        </Section>

        <Section
          title="Horarios y jornada"
          description="Horas de cada día de la semana. Crea varios (normal, verano…) y los de temporada se aplican solos en sus fechas."
          icon={<CalendarClock className="size-4" />}
        >
          <ScheduleSettings settings={settings} save={save} />
        </Section>

        <Section
          title="Recordatorios"
          description="El reloj flotante se agitará y sonará para recordarte imputar. Funcionan aunque la ventana esté oculta."
          icon={<AlarmClock className="size-4" />}
        >
          <Row label="Activar recordatorios">
            <Toggle checked={settings.remindersEnabled} onChange={(v) => save({ remindersEnabled: v })} label="Recordatorios" />
          </Row>
          <Row label="Avisar cada">
            <div className="flex items-center gap-2">
              <select
                className={cx(inputClass, 'w-40!')}
                disabled={!settings.remindersEnabled}
                value={customMode ? 'custom' : String(settings.reminderIntervalMinutes)}
                onChange={(e) => {
                  if (e.target.value === 'custom') setCustomMode(true);
                  else {
                    setCustomMode(false);
                    void save({ reminderIntervalMinutes: Number(e.target.value) });
                  }
                }}
              >
                {REMINDER_PRESETS.map((m) => (
                  <option key={m} value={m}>
                    {m} minutos
                  </option>
                ))}
                <option value="custom">Personalizado…</option>
              </select>
              {customMode && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={MAX_REMINDER_MINUTES}
                    className={cx(inputClass, 'w-20!')}
                    value={customInterval}
                    onChange={(e) => setCustomInterval(e.target.value)}
                    onBlur={() => {
                      const n = Number(customInterval);
                      if (n !== settings.reminderIntervalMinutes) void save({ reminderIntervalMinutes: Math.round(n) });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                  />
                  <span className="text-[13px] text-slate-500">min</span>
                </div>
              )}
            </div>
          </Row>
          <Row label="No avisar si la jornada de hoy está completa">
            <Toggle
              checked={settings.skipRemindersWhenComplete}
              onChange={(v) => save({ skipRemindersWhenComplete: v })}
              label="No avisar con jornada completa"
            />
          </Row>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3.5">
            <span className="mr-auto flex items-center gap-2 text-[13px] text-slate-600">
              <Timer className="size-4 text-slate-400" />
              {statusText}
            </span>
            <Button
              size="sm"
              disabled={!settings.remindersEnabled}
              onClick={() => run(() => api.reminders.snooze(15), 'Siguiente aviso pospuesto 15 min')}
            >
              Posponer 15 min
            </Button>
            {status?.pausedUntil ? (
              <Button size="sm" variant="subtle" onClick={() => run(() => api.reminders.resume(), 'Recordatorios reanudados')}>
                Reanudar
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  icon={<BellOff className="size-3.5" />}
                  disabled={!settings.remindersEnabled}
                  onClick={() => run(() => api.reminders.pause(60), 'Recordatorios en pausa 1 hora')}
                >
                  Pausar 1 h
                </Button>
                <Button
                  size="sm"
                  disabled={!settings.remindersEnabled}
                  onClick={() => run(() => api.reminders.pause('today'), 'Recordatorios en pausa hasta mañana')}
                >
                  Pausar hoy
                </Button>
              </>
            )}
          </div>
        </Section>

        <Section title="Sonido y animación">
          <Row label="Sonido de aviso">
            <Toggle checked={settings.soundEnabled} onChange={(v) => save({ soundEnabled: v })} label="Sonido" />
          </Row>
          <Row label="Volumen" hint={`${settings.soundVolume} %`}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={!settings.soundEnabled}
                defaultValue={settings.soundVolume}
                key={settings.soundVolume}
                className="w-48 accent-brand-600"
                onMouseUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  void save({ soundVolume: v });
                  playChime(v);
                }}
                onKeyUp={(e) => void save({ soundVolume: Number((e.target as HTMLInputElement).value) })}
              />
              <Button
                size="sm"
                icon={<Play className="size-3.5" />}
                disabled={!settings.soundEnabled}
                onClick={() => playChime(settings.soundVolume)}
              >
                Probar
              </Button>
            </div>
          </Row>
          <Row label="Animación del reloj (agitarse)">
            <Toggle checked={settings.animationEnabled} onChange={(v) => save({ animationEnabled: v })} label="Animación" />
          </Row>
          <div className="border-t border-slate-100 px-5 py-3.5">
            <Button size="sm" variant="subtle" icon={<AlarmClock className="size-3.5" />} onClick={() => run(() => api.reminders.test())}>
              Lanzar un recordatorio de prueba
            </Button>
          </div>
        </Section>

        <Section title="Reloj flotante" description="Puedes arrastrarlo a cualquier parte; recordará su última posición.">
          <Row label="Posición">
            <div className="flex items-center gap-2">
              <select
                className={cx(inputClass, 'w-56!')}
                value={settings.floatingPosition}
                onChange={(e) => save({ floatingPosition: e.target.value as FloatingPosition })}
              >
                <option value="bottom-right">Abajo a la derecha</option>
                <option value="top-right">Arriba a la derecha</option>
                <option value="bottom-left">Abajo a la izquierda</option>
                <option value="top-left">Arriba a la izquierda</option>
                <option value="custom" disabled={settings.floatingX === null}>
                  Personalizada (última arrastrada)
                </option>
              </select>
              <Button icon={<MonitorDown className="size-4" />} onClick={() => api.window.toFloating()}>
                Ver reloj
              </Button>
            </div>
          </Row>
        </Section>

        <Section title="Sistema">
          <Row
            label={info?.platform === 'linux' ? 'Iniciar al abrir la sesión' : 'Iniciar con Windows'}
            hint={info && !info.isPackaged ? 'Solo en la versión instalada' : 'Arranca minimizado como reloj'}
          >
            <Toggle checked={settings.autoStart} onChange={(v) => save({ autoStart: v })} label="Iniciar con el sistema" />
          </Row>
          <Row label="Al cerrar o minimizar, mantener en la bandeja del sistema" hint="Si se desactiva, cerrar la ventana sale de la aplicación">
            <Toggle checked={settings.minimizeToTray} onChange={(v) => save({ minimizeToTray: v })} label="Bandeja del sistema" />
          </Row>
        </Section>

        <Section title="Datos y copias de seguridad" icon={<Database className="size-4" />}>
          <div className="space-y-3 px-5 py-4">
            <p className="text-[13px] text-slate-500">
              Los datos se guardan solo en este ordenador. Se crea además una copia automática diaria (se conservan las 10
              últimas).
            </p>
            <code className="block truncate rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-600" title={info?.dbPath}>
              {info?.dbPath ?? '…'}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button
                icon={<Download className="size-4" />}
                onClick={() =>
                  run(async () => {
                    const f = await api.backup.export();
                    if (f) toast.success('Copia de seguridad exportada', f);
                  })
                }
              >
                Exportar copia de seguridad
              </Button>
              <Button
                icon={<Upload className="size-4" />}
                onClick={() =>
                  run(async () => {
                    if (await api.backup.import()) toast.success('Copia importada', 'Los datos se han restaurado.');
                  })
                }
              >
                Importar / restaurar copia
              </Button>
              <Button variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => api.app.openDataFolder()}>
                Abrir carpeta de datos
              </Button>
            </div>
          </div>
        </Section>

        <div className="flex items-center justify-between pb-8">
          <span className="text-xs text-slate-400">Gestor de Horas v{info?.version ?? ''}</span>
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmReset(true)}>
            Restaurar valores predeterminados
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Restaurar valores predeterminados"
        confirmLabel="Restaurar"
        message="Se restablecerá toda la configuración (apariencia, horarios —vuelve la jornada de 8,25 h—, recordatorios, sonido, posición del reloj…). Tus imputaciones, proyectos y usuario no se modifican."
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          await run(() => api.settings.reset(), 'Configuración restaurada');
          setCustomMode(false);
          setConfirmReset(false);
        }}
      />
    </div>
  );
}
