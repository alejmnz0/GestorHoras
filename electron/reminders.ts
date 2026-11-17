/**
 * Planificador de recordatorios. Vive en el proceso principal de Electron, por lo que sigue
 * funcionando aunque la ventana esté minimizada u oculta. No depende de Electron: recibe
 * el reloj y los temporizadores por inyección para poder probarlo con tiempos simulados.
 */
import type { ReminderStatus } from '../shared/types';

export interface ReminderConfig {
  enabled: boolean;
  intervalMinutes: number;
}

export interface SchedulerDeps {
  getConfig: () => ReminderConfig;
  /** Se invoca al vencer un recordatorio. */
  onFire: () => void;
  /** Si devuelve true, el aviso se omite (p. ej., jornada completa) pero se programa el siguiente. */
  shouldSkip?: () => boolean;
  /** Notifica cambios de estado (próximo aviso, pausa…). */
  onStatus?: (s: ReminderStatus) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const MIN = 60_000;
/** Los setTimeout muy largos son poco fiables (suspensión del equipo); se revisa como máximo cada minuto. */
const MAX_TICK_MS = MIN;

export class ReminderScheduler {
  private nextAt: number | null = null;
  private pausedUntil: number | null = null;
  private timer: unknown = null;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  constructor(private deps: SchedulerDeps) {
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** (Re)inicia el ciclo a partir de ahora con la configuración vigente. */
  restart(): void {
    const cfg = this.deps.getConfig();
    this.nextAt = cfg.enabled ? this.now() + cfg.intervalMinutes * MIN : null;
    this.arm();
  }

  /** Pospone el siguiente aviso `minutes` minutos a partir de ahora. */
  snooze(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    this.pausedUntil = null;
    this.nextAt = this.deps.getConfig().enabled ? this.now() + minutes * MIN : null;
    this.arm();
  }

  /** Desactiva temporalmente los avisos hasta la marca de tiempo indicada. */
  pauseUntil(epochMs: number): void {
    this.pausedUntil = epochMs;
    this.nextAt = null;
    this.arm();
  }

  resume(): void {
    this.pausedUntil = null;
    this.restart();
  }

  stop(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  status(): ReminderStatus {
    const cfg = this.deps.getConfig();
    return {
      enabled: cfg.enabled,
      intervalMinutes: cfg.intervalMinutes,
      nextAt: cfg.enabled ? this.nextAt : null,
      pausedUntil: this.pausedUntil,
    };
  }

  /** Comprobación periódica: se llama desde el temporizador o tras reanudar el equipo. */
  tick(): void {
    const now = this.now();
    const cfg = this.deps.getConfig();
    if (this.pausedUntil !== null) {
      if (now < this.pausedUntil) return this.arm();
      // Fin de la pausa: se reanuda el ciclo normal.
      this.pausedUntil = null;
      this.nextAt = cfg.enabled ? now + cfg.intervalMinutes * MIN : null;
      return this.arm();
    }
    if (!cfg.enabled) {
      this.nextAt = null;
      return this.arm();
    }
    if (this.nextAt === null) this.nextAt = now + cfg.intervalMinutes * MIN;
    if (now >= this.nextAt) {
      const skip = this.deps.shouldSkip?.() ?? false;
      if (!skip) {
        try {
          this.deps.onFire();
        } catch {
          /* un fallo al avisar nunca debe detener el planificador */
        }
      }
      this.nextAt = now + cfg.intervalMinutes * MIN;
    }
    this.arm();
  }

  private arm(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const now = this.now();
    let target: number | null = null;
    if (this.pausedUntil !== null) target = this.pausedUntil;
    else if (this.deps.getConfig().enabled && this.nextAt !== null) target = this.nextAt;
    if (target !== null) {
      const ms = Math.min(Math.max(target - now, 0), MAX_TICK_MS);
      this.timer = this.setTimer(() => this.tick(), ms);
    }
    this.deps.onStatus?.(this.status());
  }
}

/** Marca de tiempo del final del día local (para "pausar el resto del día"). */
export function endOfToday(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
