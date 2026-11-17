/**
 * Tipos compartidos entre el proceso principal (Electron Main) y la interfaz (Renderer).
 * Las horas se manejan SIEMPRE como minutos enteros para evitar errores de precisión.
 */

export type WorkType = 'incidencia' | 'desarrollo' | 'mantenimiento';

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
  /** Número de imputaciones asociadas (para saber si se puede eliminar). */
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  code: string;
  name: string;
  active?: boolean;
}

export interface TimeEntry {
  id: number;
  userId: number;
  userName: string;
  projectId: number;
  projectCode: string;
  projectName: string;
  projectActive: boolean;
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
