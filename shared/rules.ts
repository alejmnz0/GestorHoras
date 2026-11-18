/**
 * Reglas de negocio y utilidades puras. Se usan en el backend (validación definitiva)
 * y en la interfaz (validación inmediata), de modo que ambas capas aplican lo mismo.
 */
import type { Accent, Palette, ProjectKind, RoutineItem, Settings, Theme, Wallpaper, WorkSchedule, WorkType } from './types';

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
  { value: 'shared', label: 'Común (todos)', emoji: '🌐' },
  { value: 'vacation', label: 'Vacaciones', emoji: '🌴' },
  { value: 'sick_leave', label: 'Baja laboral', emoji: '🩺' },
];

/** Vacaciones o baja: no es trabajo y se registra como «ausencia». */
export function isAbsenceKind(k: ProjectKind): k is 'vacation' | 'sick_leave' {
  return k === 'vacation' || k === 'sick_leave';
}

/** Horas de trabajo: proyectos normales y tareas comunes. */
export function isWorkKind(k: ProjectKind): boolean {
  return k === 'normal' || k === 'shared';
}

export const SHARED_DISTRIBUTIONS: { value: 'none' | 'proportional' | 'equal'; label: string; hint: string }[] = [
  { value: 'none', label: 'Sin repartir', hint: 'Las tareas comunes aparecen en su propia línea.' },
  {
    value: 'proportional',
    label: 'Proporcional',
    hint: 'Cada proyecto recibe una parte según las horas que le has dedicado en el periodo.',
  },
  { value: 'equal', label: 'A partes iguales', hint: 'Se divide por igual entre los proyectos con horas en el periodo.' },
];

export function projectKindLabel(k: ProjectKind): string {
  return PROJECT_KINDS.find((p) => p.value === k)?.label ?? k;
}

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];

export const ACCENTS: { value: Exclude<Accent, 'custom'>; label: string; hex: string }[] = [
  { value: 'blue', label: 'Azul', hex: '#2563eb' },
  { value: 'indigo', label: 'Índigo', hex: '#4f46e5' },
  { value: 'violet', label: 'Violeta', hex: '#7c3aed' },
  { value: 'pink', label: 'Fucsia', hex: '#db2777' },
  { value: 'rose', label: 'Rosa', hex: '#e11d48' },
  { value: 'red', label: 'Rojo', hex: '#dc2626' },
  { value: 'orange', label: 'Naranja', hex: '#ea580c' },
  { value: 'amber', label: 'Ámbar', hex: '#d97706' },
  { value: 'green', label: 'Verde', hex: '#059669' },
  { value: 'teal', label: 'Turquesa', hex: '#0d9488' },
  { value: 'cyan', label: 'Cian', hex: '#0891b2' },
  { value: 'slate', label: 'Pizarra', hex: '#475569' },
];
export const DEFAULT_CUSTOM_ACCENT = '#8b5cf6';

/** Paletas de superficies. `light`/`dark`: [fondo de la app, paneles] para la vista previa. */
export const PALETTES: { value: Palette; label: string; hint: string; light: [string, string]; dark: [string, string] }[] = [
  { value: 'default', label: 'Clásica', hint: 'Grises azulados', light: ['#f6f7f9', '#ffffff'], dark: ['#0b1120', '#131b2d'] },
  { value: 'warm', label: 'Cálida', hint: 'Crema y sepia', light: ['#f7f3ec', '#fffdf8'], dark: ['#171310', '#211b16'] },
  { value: 'nord', label: 'Nórdica', hint: 'Azules fríos', light: ['#e5e9f0', '#f4f6f9'], dark: ['#242933', '#2e3440'] },
  { value: 'forest', label: 'Bosque', hint: 'Verdes naturales', light: ['#eef3ee', '#fbfdfb'], dark: ['#0e1510', '#151f18'] },
  { value: 'graphite', label: 'Grafito', hint: 'Grises neutros', light: ['#f4f4f5', '#ffffff'], dark: ['#0f0f11', '#18181b'] },
  { value: 'midnight', label: 'Contraste', hint: 'Negro puro de noche', light: ['#ffffff', '#ffffff'], dark: ['#000000', '#0a0a0a'] },
];

export const WALLPAPERS: { value: Wallpaper; label: string }[] = [
  { value: 'none', label: 'Sin fondo' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'sunset', label: 'Atardecer' },
  { value: 'ocean', label: 'Océano' },
  { value: 'meadow', label: 'Pradera' },
  { value: 'dots', label: 'Puntos' },
  { value: 'grid', label: 'Cuadrícula' },
  { value: 'waves', label: 'Ondas' },
  { value: 'image', label: 'Mi imagen' },
];
export const WALLPAPER_MAX_BYTES = 8 * 1024 * 1024;

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

// ---------------------------------------------------------------------------
// Horarios
// ---------------------------------------------------------------------------

export const LEGACY_SCHEDULE_ID = 'normal';
export const MAX_SCHEDULES = 8;
export const SCHEDULE_NAME_MAX_LENGTH = 40;

type ScheduleSettings = Pick<Settings, 'schedules' | 'activeScheduleId' | 'maxDailyMinutes' | 'workDays'>;

/** Horario equivalente a la configuración clásica (misma jornada en todos los días laborables). */
export function legacySchedule(maxDailyMinutes: number, workDays: number[]): WorkSchedule {
  return {
    id: LEGACY_SCHEDULE_ID,
    name: 'Horario normal',
    minutes: [0, 1, 2, 3, 4, 5, 6].map((d) => (workDays.includes(d) ? maxDailyMinutes : 0)),
    period: null,
  };
}

/** Plantillas para crear horarios con un clic desde Configuración. */
export const SCHEDULE_TEMPLATES: { key: string; label: string; make: () => Omit<WorkSchedule, 'id'> }[] = [
  {
    key: 'normal',
    label: 'Normal: L-J 8,25 h · V 7 h',
    make: () => ({ name: 'Horario normal', minutes: [0, 495, 495, 495, 495, 420, 0], period: null }),
  },
  {
    key: 'summer',
    label: 'Verano: L-V 7 h (15/06 - 15/09)',
    make: () => ({
      name: 'Horario de verano',
      minutes: [0, 420, 420, 420, 420, 420, 0],
      period: { from: '06-15', to: '09-15' },
    }),
  },
  {
    key: 'intensive',
    label: 'Intensiva: L-V 7 h',
    make: () => ({ name: 'Jornada intensiva', minutes: [0, 420, 420, 420, 420, 420, 0], period: null }),
  },
  {
    key: 'part',
    label: 'Media jornada: L-V 4 h',
    make: () => ({ name: 'Media jornada', minutes: [0, 240, 240, 240, 240, 240, 0], period: null }),
  },
];

/** 'MM-DD' válido (admite 02-29). */
export function isValidMonthDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{2}-\d{2}$/.test(v)) return false;
  const [m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** ¿La fecha cae dentro del periodo anual? Admite periodos que cruzan el fin de año (p. ej. 12-15 → 01-10). */
export function inPeriod(iso: string, period: { from: string; to: string }): boolean {
  const md = iso.slice(5);
  return period.from <= period.to ? md >= period.from && md <= period.to : md >= period.from || md <= period.to;
}

/** Horarios efectivos: los configurados o, si no hay ninguno, el equivalente clásico. */
export function schedulesOf(s: ScheduleSettings): WorkSchedule[] {
  return s.schedules?.length ? s.schedules : [legacySchedule(s.maxDailyMinutes, s.workDays)];
}

/** Horario principal: el que rige fuera de los periodos de temporada. */
export function activeSchedule(s: ScheduleSettings): WorkSchedule {
  const list = schedulesOf(s);
  return list.find((x) => x.id === s.activeScheduleId) ?? list.find((x) => !x.period) ?? list[0];
}

/**
 * Horario que rige una fecha: el primer horario de temporada (distinto del principal) cuyo
 * periodo incluya la fecha o, si no hay, el horario principal.
 */
export function scheduleFor(date: string, s: ScheduleSettings): WorkSchedule {
  const main = activeSchedule(s);
  return schedulesOf(s).find((x) => x.id !== main.id && x.period && inPeriod(date, x.period)) ?? main;
}

/** Jornada esperada en una fecha (0 si no es laborable). */
export function expectedMinutesFor(date: string, s: ScheduleSettings): number {
  return scheduleFor(date, s).minutes[weekdayOf(date)] ?? 0;
}

/** ¿Es laborable según el horario que rige ese día? */
export function isWorkdayFor(date: string, s: ScheduleSettings): boolean {
  return expectedMinutesFor(date, s) > 0;
}

/**
 * Máximo imputable en una fecha: la jornada de ese día o, en días no laborables (por si se
 * trabaja un sábado), la jornada más larga de ese horario.
 */
export function dayLimitFor(date: string, s: ScheduleSettings): number {
  const sch = scheduleFor(date, s);
  const m = sch.minutes[weekdayOf(date)] ?? 0;
  return m > 0 ? m : Math.max(SLOT_MINUTES, ...sch.minutes);
}

/** Resumen corto de un horario: "L-J 8,25 h · V 7 h". */
export function describeSchedule(sch: WorkSchedule): string {
  const groups: { days: string[]; minutes: number; lastIdx: number }[] = [];
  WEEKDAYS.forEach((d, idx) => {
    const m = sch.minutes[d.value] ?? 0;
    if (m === 0) return;
    const last = groups.at(-1);
    if (last && last.minutes === m && last.lastIdx === idx - 1) {
      last.days.push(d.short);
      last.lastIdx = idx;
    } else groups.push({ days: [d.short], minutes: m, lastIdx: idx });
  });
  if (!groups.length) return 'Sin días laborables';
  return groups
    .map((g) => `${g.days.length > 2 ? `${g.days[0]}-${g.days.at(-1)}` : g.days.join(', ')} ${formatHours(g.minutes)} h`)
    .join(' · ');
}

/** "06-15" → "15/06" */
export function formatMonthDay(md: string): string {
  const [m, d] = md.split('-');
  return `${d}/${m}`;
}

export function validateSchedules(v: unknown): WorkSchedule[] {
  if (!Array.isArray(v)) throw new ValidationError('Horarios no válidos.');
  if (v.length === 0) throw new ValidationError('Debe haber al menos un horario.');
  if (v.length > MAX_SCHEDULES) throw new ValidationError(`No puede haber más de ${MAX_SCHEDULES} horarios.`);
  const ids = new Set<string>();
  return v.map((raw: unknown) => {
    const x = (raw ?? {}) as Record<string, unknown>;
    const id = typeof x.id === 'string' ? x.id.trim() : '';
    if (!/^[\w-]{1,40}$/.test(id) || ids.has(id)) throw new ValidationError('Identificador de horario no válido.');
    ids.add(id);
    const name = typeof x.name === 'string' ? x.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) throw new ValidationError('Cada horario necesita un nombre.');
    if (name.length > SCHEDULE_NAME_MAX_LENGTH) {
      throw new ValidationError(`El nombre del horario no puede superar los ${SCHEDULE_NAME_MAX_LENGTH} caracteres.`);
    }
    const minutes = x.minutes;
    if (
      !Array.isArray(minutes) ||
      minutes.length !== 7 ||
      minutes.some(
        (m) => !Number.isInteger(m) || m < 0 || m % SLOT_MINUTES !== 0 || m > MAX_CONFIGURABLE_DAILY_MINUTES,
      )
    ) {
      throw new ValidationError(`Las horas del horario «${name}» deben ser múltiplos de 0,25 h entre 0 y 24 h.`);
    }
    if (minutes.every((m) => m === 0)) {
      throw new ValidationError(`El horario «${name}» necesita al menos un día laborable.`);
    }
    let period: WorkSchedule['period'] = null;
    if (x.period !== null && x.period !== undefined) {
      const p = x.period as Record<string, unknown>;
      if (!isValidMonthDay(p.from) || !isValidMonthDay(p.to)) {
        throw new ValidationError(`Las fechas del periodo de «${name}» no son válidas.`);
      }
      period = { from: p.from, to: p.to };
    }
    return { id, name, minutes: [...(minutes as number[])], period };
  });
}

// ---------------------------------------------------------------------------
// Rutinas
// ---------------------------------------------------------------------------

export const ROUTINE_NAME_MAX_LENGTH = 60;
export const ROUTINE_MAX_ITEMS = 20;

export function validateRoutineName(v: unknown): string {
  const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!t) throw new ValidationError('La rutina necesita un nombre.');
  if (t.length > ROUTINE_NAME_MAX_LENGTH) {
    throw new ValidationError(`El nombre de la rutina no puede superar los ${ROUTINE_NAME_MAX_LENGTH} caracteres.`);
  }
  return t;
}

/** Valida las tareas de una rutina (los proyectos los comprueba el backend). */
export function validateRoutineItems(v: unknown): RoutineItem[] {
  if (!Array.isArray(v) || v.length === 0) throw new ValidationError('Añade al menos una tarea a la rutina.');
  if (v.length > ROUTINE_MAX_ITEMS) {
    throw new ValidationError(`Una rutina admite como máximo ${ROUTINE_MAX_ITEMS} tareas.`);
  }
  return v.map((raw: unknown, i) => {
    const x = (raw ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(x.projectId)) throw new ValidationError(`Elige el proyecto de la tarea ${i + 1}.`);
    const minutes = validateEntryMinutes(x.minutes);
    if (!isWorkType(x.workType)) throw new ValidationError(`Elige el tipo de trabajo de la tarea ${i + 1}.`);
    return {
      projectId: x.projectId as number,
      minutes,
      workType: x.workType,
      description: validateDescription(x.description),
    };
  });
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
  customAccent: DEFAULT_CUSTOM_ACCENT,
  palette: 'default',
  wallpaper: 'none',
  wallpaperIntensity: 60,
  glassPanels: false,
  wallpaperImageId: null,
  workDays: [1, 2, 3, 4, 5],
  schedules: [],
  activeScheduleId: null,
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
    if (patch.accent !== 'custom' && !ACCENTS.some((a) => a.value === patch.accent)) {
      throw new ValidationError('Color de acento no válido.');
    }
    out.accent = patch.accent as Accent;
  }
  if ('customAccent' in patch) {
    const v = patch.customAccent;
    if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new ValidationError('Color personalizado no válido.');
    out.customAccent = v.toLowerCase();
  }
  if ('palette' in patch) {
    if (!PALETTES.some((p) => p.value === patch.palette)) throw new ValidationError('Paleta no válida.');
    out.palette = patch.palette as Palette;
  }
  if ('wallpaper' in patch) {
    if (!WALLPAPERS.some((w) => w.value === patch.wallpaper)) throw new ValidationError('Fondo de pantalla no válido.');
    out.wallpaper = patch.wallpaper as Wallpaper;
  }
  if ('wallpaperIntensity' in patch) {
    const v = patch.wallpaperIntensity;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 10 || v > 100) {
      throw new ValidationError('La intensidad del fondo debe estar entre 10 y 100.');
    }
    out.wallpaperIntensity = Math.round(v);
  }
  if ('schedules' in patch) out.schedules = validateSchedules(patch.schedules);
  if ('activeScheduleId' in patch) {
    const v = patch.activeScheduleId;
    if (v !== null && (typeof v !== 'string' || !v)) throw new ValidationError('Horario no válido.');
    out.activeScheduleId = v as string | null;
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
  bool('glassPanels');
  return out;
}
