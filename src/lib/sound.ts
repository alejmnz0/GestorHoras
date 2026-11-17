/**
 * Sonido de aviso generado con Web Audio: discreto (dos notas suaves) y sin ficheros externos.
 * @param volume 0 - 100
 */
export function playChime(volume: number): void {
  const level = Math.max(0, Math.min(100, volume)) / 100;
  if (level === 0) return;
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.45 * level;
    master.connect(ctx.destination);
    const notes = [
      { f: 880, t: 0 },
      { f: 1318.5, t: 0.16 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.f;
      const start = ctx.currentTime + n.t;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(1, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(g).connect(master);
      osc.start(start);
      osc.stop(start + 0.6);
    }
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* sin dispositivo de audio: se ignora */
  }
}
