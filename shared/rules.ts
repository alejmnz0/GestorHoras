/**
 * Reglas de negocio y utilidades puras. Se usan en el backend (validación definitiva)
 * y en la interfaz (validación inmediata), de modo que ambas capas aplican lo mismo.
 */
import type { Accent, ProjectKind, Settings, Theme, WorkType } from './types';

export const SLOT_MINUTES = 15;
export const DEFAULT_MAX_DAILY_MINUTES = 495; // 8,25 h
export const MAX_CONFIGURABLE_DAILY_MINUTES = 24 * 60;
export const DESCRIPTION_MAX_LENGTH = 500;
export const PROJECT_CODE_MAX_LENGTH = 30;
export const PROJECT_NAME_MAX_LENGTH = 120;
export const USER_NAME_MAX_LENGTH = 80;
export const REMINDER_PRESETS = [15, 30, 45, 60, 90] as const;
export const MIN_REMINDER_MINUTES = 1;
export const MAX_REMINDER_MINUTES = 480;

/** Tipos seleccionables para proyectos normales. "ausencia" se asigna sola a vacaciones/baja. */
export const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: 'incidencia', label: 'Incidencia' },
  { value: 'desarrollo', label: 'Desarrollo' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
];

export const PROJECT_KINDS: { value: ProjectKind; label: string; emoji: string }[] = [
  { value: 'normal', label: 'Normal', emoji: '' },
  { value: 'vacation', label: 'Vacaciones', emoji: '🌴' },
  { value: 'sick_leave', label: 'Baja laboral', emoji: '🩺' },
];

export function projectKindLabel(k: ProjectKind): string {
  return PROJECT_KINDS.find((p) => p.value === k)?.label ?? k;
}

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];

export const ACCENTS: { value: Accent; label: string; hex: string }[] = [
  { value: 'blue', label: 'Azul', hex: '#2563eb' },
  { value: 'violet', label: 'Violeta', hex: '#7c3aed' },
  { value: 'green', label: 'Verde', hex: '#059669' },
  { value: 'orange', label: 'Naranja', hex: '#ea580c' },
  { value: 'rose', label: 'Rosa', hex: '#e11d48' },
];

export const WEEKDAYS = [
  { value: 1, short: 'L', label: 'Lunes' },
  { value: 2, short: 'M', label: 'Martes' },
  { value: 3, short: 'X', label: 'Miércoles' },
  { value: 4, short: 'J', label: 'Jueves' },
  { value: 5, short: 'V', label: 'Viernes' },
  { value: 6, short: 'S', label: 'Sábado' },
  { value: 0, short: 'D', label: 'Domingo' },
];

/** Día de la semana (0 = domingo) de una fecha YYYY-MM-DD. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWorkday(iso: string, workDays: number[]): boolean {
  return workDays.includes(weekdayOf(iso));
}

export const PERIOD_PRESETS = [
  { value: 'today', label: 'Hoy' },
  { value: 'thisWeek', label: 'Esta semana' },
  { value: 'lastWeek', label: 'Semana pasada' },
  { value: 'thisMonth', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes pasado' },
  { value: 'thisYear', label: 'Este año' },
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['value'];

/** Rango de fechas de un periodo predefinido (semanas de lunes a domingo). */
export function periodRange(p: PeriodPreset, today: string = todayIso()): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'thisWeek':
      return { from: monday, to: addDays(monday, 6) };
    case 'lastWeek':
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case 'thisMonth':
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

/** Lista de fechas entre dos fechas incluidas (máx. `limit`). */
export function dateRange(from: string, to: string, limit = 3700): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < limit; d = addDays(d, 1)) out.push(d);
  return out;
}

export const DEFAULT_SETTINGS: Settings = {
  currentUserId: null,
  maxDailyMinutes: DEFAULT_MAX_DAILY_MINUTES,
  remindersEnabled: true,
  reminderIntervalMinutes: 30,
  skipRemindersWhenComplete: true,
  soundEnabled: true,
  soundVolume: 50,
  animationEnabled: true,
  floatingPosition: 'bottom-right',
  floatingX: null,
  floatingY: null,
  autoStart: false,
  minimizeToTray: true,
  theme: 'system',
  accent: 'blue',
  workDays: [1, 2, 3, 4, 5],
};

/** Error de validación: su mensaje se muestra tal cual al usuario. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function isWorkType(v: unknown): v is WorkType {
  return v === 'incidencia' || v === 'desarrollo' || v === 'mantenimiento' || v === 'ausencia';
}

export function workTypeLabel(v: WorkType): string {
  if (v === 'ausencia') return 'Ausencia';
  return WORK_TYPES.find((w) => w.value === v)?.label ?? v;
}

/** Comprueba que una cadena sea una fecha real en formato YYYY-MM-DD. */
export function isValidIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Fecha local actual en formato YYYY-MM-DD (no usa UTC para no cambiar de día a medianoche). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayIso(dt);
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatDate(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Fecha larga en español: "lunes, 16 de noviembre de 2026" */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 330 → "5,50" */
export function formatHours(minutes: number): string {
  return (minutes / 60).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 90 → "1 h 30 min" */
export function formatHoursLong(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

export function formatPercent(p: number): string {
  return p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
}

// ---------------------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------------------

export function validateEntryMinutes(minutes: unknown): number {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) {
    throw new ValidationError('Las horas indicadas no son válidas.');
  }
  if (minutes <= 0) throw new ValidationError('No se pueden imputar horas negativas ni cero.');
  if (minutes < SLOT_MINUTES) throw new ValidationError('El mínimo por imputación es de 0,25 h (15 minutos).');
  if (minutes % SLOT_MINUTES !== 0) {
    throw new ValidationError('Las horas deben ser múltiplos de 0,25 h (15 minutos).');
  }
  return minutes;
}

/**
 * Comprueba el límite diario.
 * @param alreadyMinutes minutos ya imputados ese día SIN contar el registro que se edita.
 */
export function checkDailyLimit(alreadyMinutes: number, newMinutes: number, maxMinutes: number): void {
  const available = Math.max(0, maxMinutes - alreadyMinutes);
  if (newMinutes > available) {
    if (available === 0) {
      throw new ValidationError(
        `La jornada de este día ya está completa (${formatHours(maxMinutes)} h). No se pueden imputar más horas.`,
      );
    }
    throw new ValidationError(
      `Se superaría el máximo diario de ${formatHours(maxMinutes)} h. Solo puedes imputar ${formatHours(available)} h más este día.`,
    );
  }
}

export function validateDescription(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ValidationError('La descripción no es válida.');
  const t = v.trim();
  if (t.length > DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError(`La descripción no puede superar los ${DESCRIPTION_MAX_LENGTH} caracteres.`);
  }
  return t;
}

export function validateUserName(v: unknown): string {
  const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!t) throw new ValidationError('El nombre del usuario es obligatorio.');
  if (t.length > USER_NAME_MAX_LENGTH) {
    throw new ValidationError(`El nombre no puede superar los ${USER_NAME_MAX_LENGTH} caracteres.`);
  }
  return t;
}

export function validateProjectCode(v: unknown): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) throw new ValidationError('El código del proyecto es obligatorio.');
  if (t.length > PROJECT_CODE_MAX_LENGTH) {
    throw new ValidationError(`El código no puede superar los ${PROJECT_CODE_MAX_LENGTH} caracteres.`);
  }
  return t;
}

export function validateProjectName(v: unknown): string {
  const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!t) throw new ValidationError('El nombre del proyecto es obligatorio.');
  if (t.length > PROJECT_NAME_MAX_LENGTH) {
    throw new ValidationError(`El nombre no puede superar los ${PROJECT_NAME_MAX_LENGTH} caracteres.`);
  }
  return t;
}

export function validateMaxDailyMinutes(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < SLOT_MINUTES || v % SLOT_MINUTES !== 0) {
    throw new ValidationError('La jornada diaria debe ser un múltiplo de 0,25 h y como mínimo 0,25 h.');
  }
  if (v > MAX_CONFIGURABLE_DAILY_MINUTES) throw new ValidationError('La jornada diaria no puede superar 24 h.');
  return v;
}

export function validateReminderInterval(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < MIN_REMINDER_MINUTES || v > MAX_REMINDER_MINUTES) {
    throw new ValidationError(
      `El intervalo de recordatorio debe estar entre ${MIN_REMINDER_MINUTES} y ${MAX_REMINDER_MINUTES} minutos.`,
    );
  }
  return v;
}

/** Valida y normaliza un objeto parcial de configuración. Ignora claves desconocidas. */
export function validateSettingsPatch(patch: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  const bool = (k: keyof Settings) => {
    if (k in patch) {
      if (typeof patch[k] !== 'boolean') throw new ValidationError(`Valor no válido para ${String(k)}.`);
      (out as Record<string, unknown>)[k] = patch[k];
    }
  };
  if ('currentUserId' in patch) {
    const v = patch.currentUserId;
    if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v <= 0)) {
      throw new ValidationError('Usuario no válido.');
    }
    out.currentUserId = v as number | null;
  }
  if ('maxDailyMinutes' in patch) out.maxDailyMinutes = validateMaxDailyMinutes(patch.maxDailyMinutes);
  if ('reminderIntervalMinutes' in patch) {
    out.reminderIntervalMinutes = validateReminderInterval(patch.reminderIntervalMinutes);
  }
  if ('soundVolume' in patch) {
    const v = patch.soundVolume;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
      throw new ValidationError('El volumen debe estar entre 0 y 100.');
    }
    out.soundVolume = Math.round(v);
  }
  if ('floatingPosition' in patch) {
    const v = patch.floatingPosition;
    if (!['top-right', 'bottom-right', 'top-left', 'bottom-left', 'custom'].includes(v as string)) {
      throw new ValidationError('Posición del reloj no válida.');
    }
    out.floatingPosition = v as Settings['floatingPosition'];
  }
  for (const k of ['floatingX', 'floatingY'] as const) {
    if (k in patch) {
      const v = patch[k];
      if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
        throw new ValidationError('Posición del reloj no válida.');
      }
      out[k] = v === null ? null : Math.round(v as number);
    }
  }
  if ('theme' in patch) {
    if (!THEMES.some((t) => t.value === patch.theme)) throw new ValidationError('Tema no válido.');
    out.theme = patch.theme as Theme;
  }
  if ('accent' in patch) {
    if (!ACCENTS.some((a) => a.value === patch.accent)) throw new ValidationError('Color de acento no válido.');
    out.accent = patch.accent as Accent;
  }
  if ('workDays' in patch) {
    const v = patch.workDays;
    if (!Array.isArray(v) || v.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new ValidationError('Días laborables no válidos.');
    }
    if (v.length === 0) throw new ValidationError('Debe haber al menos un día laborable.');
    out.workDays = [...new Set(v as number[])].sort();
  }
  bool('remindersEnabled');
  bool('skipRemindersWhenComplete');
  bool('soundEnabled');
  bool('animationEnabled');
  bool('autoStart');
  bool('minimizeToTray');
  return out;
}
