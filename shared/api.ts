/**
 * Contrato de la API que el preload expone al renderer como `window.api`.
 * Todas las llamadas devuelven promesas; los errores llegan como `Error` con un mensaje legible.
 */
import type {
  AbsenceInput,
  AbsenceResult,
  StatsResult,
  SharedDistribution,
  AppInfo,
  DayData,
  DaySummary,
  EntryInput,
  HistoryFilter,
  HistoryResult,
  Project,
  ProjectInput,
  Routine,
  RoutineApplyResult,
  RoutineInput,
  ReminderAlert,
  ReminderStatus,
  Settings,
  TimeEntry,
  User,
} from './types';

export type PauseOption = number | 'today';

export interface Api {
  app: {
    info(): Promise<AppInfo>;
    openDataFolder(): Promise<void>;
    logError(message: string): Promise<void>;
  };
  users: {
    list(): Promise<User[]>;
    create(name: string): Promise<User>;
    rename(id: number, name: string): Promise<User>;
  };
  projects: {
    list(opts?: { includeInactive?: boolean; search?: string }): Promise<Project[]>;
    create(input: ProjectInput): Promise<Project>;
    update(id: number, input: ProjectInput): Promise<Project>;
    setActive(id: number, active: boolean): Promise<Project>;
    remove(id: number): Promise<void>;
  };
  entries: {
    day(userId: number, date: string): Promise<DayData>;
    create(input: EntryInput): Promise<TimeEntry>;
    update(id: number, input: EntryInput): Promise<TimeEntry>;
    remove(id: number): Promise<void>;
    history(filter: HistoryFilter): Promise<HistoryResult>;
    stats(filter: HistoryFilter, distribution?: SharedDistribution): Promise<StatsResult>;
    /** Última imputación del usuario o null. */
    last(userId: number): Promise<TimeEntry | null>;
    registerAbsence(input: AbsenceInput): Promise<AbsenceResult>;
    /** Devuelve la ruta del fichero guardado o null si se canceló. */
    exportHistory(filter: HistoryFilter, format: 'xlsx' | 'csv'): Promise<string | null>;
  };
  routines: {
    /** Rutinas del usuario; `date` indica para qué día se calcula «ya aplicada». */
    list(userId: number, date: string): Promise<Routine[]>;
    create(input: RoutineInput): Promise<Routine>;
    update(id: number, input: RoutineInput): Promise<Routine>;
    remove(id: number): Promise<void>;
    apply(id: number, date: string): Promise<RoutineApplyResult>;
  };
  appearance: {
    /** Abre un selector de imagen y la guarda como fondo. true si se eligió una. */
    pickWallpaper(): Promise<boolean>;
    /** Imagen de fondo propia como data URL, o null. */
    wallpaperImage(): Promise<string | null>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: Partial<Settings>): Promise<Settings>;
    reset(): Promise<Settings>;
  };
  reminders: {
    status(): Promise<ReminderStatus>;
    snooze(minutes: number): Promise<ReminderStatus>;
    pause(option: PauseOption): Promise<ReminderStatus>;
    resume(): Promise<ReminderStatus>;
    test(): Promise<void>;
  };
  backup: {
    export(): Promise<string | null>;
    /** true si se importó (la interfaz debe recargar los datos). */
    import(): Promise<boolean>;
  };
  window: {
    toFloating(): Promise<void>;
  };
  floating: {
    summary(): Promise<DaySummary | null>;
    dragStart(): void;
    dragMove(dx: number, dy: number): void;
    dragEnd(): void;
    click(): void;
    contextMenu(): void;
    setIgnoreMouse(ignore: boolean): void;
  };
  on: {
    dataChanged(cb: () => void): () => void;
    settingsChanged(cb: (s: Settings) => void): () => void;
    reminder(cb: (a: ReminderAlert) => void): () => void;
    reminderStatus(cb: (s: ReminderStatus) => void): () => void;
    floatingShown(cb: () => void): () => void;
    routinesAutoApplied(cb: (r: (RoutineApplyResult & { name: string })[]) => void): () => void;
  };
}
