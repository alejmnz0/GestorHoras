import { describe, expect, it } from 'vitest';
import { ReminderScheduler, endOfToday } from '../electron/reminders';

/** Reloj y temporizador simulados: permiten "avanzar" horas en milisegundos. */
function harness(config = { enabled: true, intervalMinutes: 30 }) {
  let now = Date.UTC(2026, 10, 16, 8, 0, 0);
  let timer: { at: number; fn: () => void } | null = null;
  let fired = 0;
  let skip = false;
  const cfg = { ...config };
  const s = new ReminderScheduler({
    getConfig: () => cfg,
    onFire: () => fired++,
    shouldSkip: () => skip,
    now: () => now,
    setTimer: (fn, ms) => (timer = { at: now + ms, fn }),
    clearTimer: () => (timer = null),
  });
  const advance = (minutes: number) => {
    const end = now + minutes * 60_000;
    while (timer && timer.at <= end) {
      now = timer.at;
      const t = timer;
      timer = null;
      t.fn();
    }
    now = end;
  };
  return {
    s,
    cfg,
    advance,
    fired: () => fired,
    setSkip: (v: boolean) => (skip = v),
    now: () => now,
  };
}

describe('Recordatorios', () => {
  it('avisa cada intervalo configurado', () => {
    const h = harness();
    h.s.restart();
    h.advance(29);
    expect(h.fired()).toBe(0);
    h.advance(1);
    expect(h.fired()).toBe(1);
    h.advance(60);
    expect(h.fired()).toBe(3);
  });

  it('no avisa si están desactivados', () => {
    const h = harness({ enabled: false, intervalMinutes: 15 });
    h.s.restart();
    h.advance(120);
    expect(h.fired()).toBe(0);
    expect(h.s.status().nextAt).toBeNull();
  });

  it('posponer retrasa el siguiente aviso', () => {
    const h = harness();
    h.s.restart();
    h.advance(25);
    h.s.snooze(15); // siguiente a los 40 min
    h.advance(10);
    expect(h.fired()).toBe(0);
    h.advance(5);
    expect(h.fired()).toBe(1);
  });

  it('la pausa temporal suprime avisos y se reanuda sola', () => {
    const h = harness({ enabled: true, intervalMinutes: 15 });
    h.s.restart();
    h.s.pauseUntil(h.now() + 60 * 60_000);
    h.advance(60);
    expect(h.fired()).toBe(0);
    expect(h.s.status().pausedUntil).toBeNull();
    h.advance(15);
    expect(h.fired()).toBe(1);
  });

  it('reanudar manualmente quita la pausa', () => {
    const h = harness({ enabled: true, intervalMinutes: 15 });
    h.s.restart();
    h.s.pauseUntil(h.now() + 120 * 60_000);
    h.s.resume();
    h.advance(15);
    expect(h.fired()).toBe(1);
  });

  it('omite el aviso si la jornada está completa pero sigue programando', () => {
    const h = harness({ enabled: true, intervalMinutes: 15 });
    h.s.restart();
    h.setSkip(true);
    h.advance(45);
    expect(h.fired()).toBe(0);
    h.setSkip(false);
    h.advance(15);
    expect(h.fired()).toBe(1);
  });

  it('cambiar el intervalo y reiniciar aplica el nuevo valor', () => {
    const h = harness();
    h.s.restart();
    h.cfg.intervalMinutes = 90;
    h.s.restart();
    h.advance(89);
    expect(h.fired()).toBe(0);
    h.advance(1);
    expect(h.fired()).toBe(1);
  });

  it('tras suspender el equipo avisa una sola vez al despertar', () => {
    const h = harness({ enabled: true, intervalMinutes: 15 });
    h.s.restart();
    // Durante la suspensión el temporizador no corre: lo detenemos, avanzamos 3 h y
    // simulamos el evento "resume" de powerMonitor, que llama a tick().
    h.s.stop();
    h.advance(180);
    h.s.tick();
    expect(h.fired()).toBe(1);
  });

  it('endOfToday devuelve el final del día local', () => {
    const d = new Date(endOfToday(new Date(2026, 10, 16, 10, 0).getTime()));
    expect(d.getHours()).toBe(23);
    expect(d.getDate()).toBe(16);
  });
});
