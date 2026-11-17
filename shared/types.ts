/**
 * Tipos compartidos entre el proceso principal (Electron Main) y la interfaz (Renderer).
 * Las horas se manejan SIEMPRE como minutos enteros para evitar errores de precisión.
 */

export type WorkType = 'incidencia' | 'desarrollo' | 'mantenimiento' | 'ausencia';

/**
 * normal: proyecto de trabajo.
 * shared: proyecto especial «Todos los proyectos» para tareas comunes (se reparten solo al analizar).
 * vacation / sick_leave: proyectos especiales de ausencia.
 * Solo puede haber uno de cada tipo especial.
 */
export type ProjectKind = 'normal' | 'shared' | 'vacation' | 'sick_leave';
export type AbsenceKind = 'vacation' | 'sick_leave';

/** Cómo mostrar en estadísticas las horas de tareas comunes. */
export type SharedDistribution = 'none' | 'proportional' | 'equal';

export type Theme = 'system' | 'light' | 'dark';
export type Accent = 'blue' | 'violet' | 'green' | 'orange' | 'rose';

export interface User {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  active: boolean;
  kind: ProjectKind;
  /** Número de imputaciones asociadas (para saber si se puede eliminar). */
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  code: string;
  name: string;
  active?: boolean;
  kind?: ProjectKind;
}

export interface TimeEntry {
  id: number;
  userId: number;
  userName: string;
  projectId: number;
  projectCode: string;
  projectName: string;
  projectActive: boolean;
  projectKind: ProjectKind;
  /** Fecha en formato ISO YYYY-MM-DD */
  date: string;
  minutes: number;
  workType: WorkType;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntryInput {
  userId: number;
  projectId: number;
  date: string;
  minutes: number;
  workType: WorkType;
  description?: string;
}

export type SortField = 'date' | 'project' | 'user' | 'hours';

export interface HistoryFilter {
  search?: string;
  userId?: number | null;
  projectId?: number | null;
  workType?: WorkType | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  sortBy?: SortField;
  sortDir?: 'asc' | 'desc';
}

export interface HistoryResult {
  rows: TimeEntry[];
  totalMinutes: number;
}

export interface DaySummary {
  date: string;
  userId: number;
  maxMinutes: number;
  imputedMinutes: number;
  pendingMinutes: number;
  /** Porcentaje 0-100 con dos decimales */
  percent: number;
  complete: boolean;
  /** Día laborable según la configuración (L-V por defecto). */
  workday: boolean;
  /** Minutos imputados a vacaciones / baja ese día. */
  vacationMinutes: number;
  sickMinutes: number;
}

export interface DayData {
  entries: TimeEntry[];
  summary: DaySummary;
}

export type FloatingPosition = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left' | 'custom';

export interface Settings {
  currentUserId: number | null;
  maxDailyMinutes: number;
  remindersEnabled: boolean;
  reminderIntervalMinutes: number;
  /** No avisar cuando la jornada de hoy ya está completa */
  skipRemindersWhenComplete: boolean;
  soundEnabled: boolean;
  /** 0 - 100 */
  soundVolume: number;
  animationEnabled: boolean;
  floatingPosition: FloatingPosition;
  floatingX: number | null;
  floatingY: number | null;
  autoStart: boolean;
  minimizeToTray: boolean;
  theme: Theme;
  accent: Accent;
  /** Días laborables: 0 = domingo … 6 = sábado. */
  workDays: number[];
}

export interface AbsenceInput {
  userId: number;
  kind: AbsenceKind;
  dateFrom: string;
  dateTo: string;
  /** Minutos por día, o null para completar lo pendiente de cada día. */
  minutesPerDay: number | null;
  description?: string;
}

export interface AbsenceResult {
  /** Días en los que se ha registrado la ausencia. */
  dates: string[];
  /** Días laborables omitidos porque ya estaban completos. */
  skippedFull: string[];
  /** Días no laborables omitidos (fines de semana, etc.). */
  skippedNonWorking: number;
  /** Días en los que solo cabía una parte de lo pedido. */
  truncated: string[];
}

export interface ProjectStat {
  projectId: number;
  code: string;
  name: string;
  kind: ProjectKind;
  active: boolean;
  /** Minutos totales mostrados (directos + parte repartida; puede tener decimales al repartir). */
  minutes: number;
  /** Minutos imputados directamente al proyecto. */
  directMinutes: number;
  /** Parte de las tareas comunes asignada al repartir (0 si no se reparte). */
  sharedMinutes: number;
  /** % sobre las horas de trabajo (sin ausencias); para ausencias, sobre el total. */
  percent: number;
  entries: number;
}

export interface StatsResult {
  dateFrom: string | null;
  dateTo: string | null;
  /** Usuario para el que se calculan jornada esperada y días pendientes (null si hay varios). */
  userId: number | null;
  totalMinutes: number;
  workMinutes: number;
  vacationMinutes: number;
  sickMinutes: number;
  entryCount: number;
  daysWithEntries: number;
  avgWorkMinutesPerDay: number;
  vacationDays: number;
  sickDays: number;
  workingDays: number | null;
  expectedMinutes: number | null;
  /** % de la jornada cubierta en los días laborables ya transcurridos del periodo. */
  coveragePercent: number | null;
  elapsedWorkingDays: number | null;
  /** true si hay filtros de proyecto/tipo/búsqueda (la cobertura no aplica). */
  coveragePartial: boolean;
  /** true si la evolución diaria muestra solo los últimos 92 días del periodo. */
  byDayTruncated: boolean;
  /** Minutos de tareas comunes en el periodo y cómo se están mostrando. */
  sharedMinutes: number;
  distribution: SharedDistribution;
  /** Proyectos entre los que se reparte (vacío si no se reparte). */
  distributionTargets: number;
  /** true si hay filtro de proyecto o búsqueda: al repartir, los % son la cuota sobre todo el periodo. */
  narrowed: boolean;
  incompleteDays: { date: string; imputedMinutes: number; pendingMinutes: number }[];
  byProject: ProjectStat[];
  byWorkType: { workType: WorkType; minutes: number; percent: number }[];
  byDay: { date: string; minutes: number; workday: boolean }[];
}

export interface ReminderStatus {
  enabled: boolean;
  intervalMinutes: number;
  /** Epoch ms del próximo aviso o null si no hay ninguno programado */
  nextAt: number | null;
  /** Epoch ms hasta el que están pausados, o null */
  pausedUntil: number | null;
}

export interface ReminderAlert {
  sound: boolean;
  volume: number;
  animation: boolean;
}

export interface AppInfo {
  version: string;
  dbPath: string;
  logPath: string;
  isPackaged: boolean;
  platform: string;
}

/** Respuesta estándar del IPC: nunca se lanzan excepciones a través del puente. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };
