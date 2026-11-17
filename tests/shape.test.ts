import { describe, expect, it } from 'vitest';
import { circleShape } from '../electron/shape';

const inside = (rects: ReturnType<typeof circleShape>, x: number, y: number) =>
  rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);

describe('Forma circular del reloj en Linux', () => {
  const rects = circleShape(84, 35);
  it('incluye el reloj completo (radio 28) y el margen de la animación', () => {
    for (let a = 0; a < 360; a += 15) {
      const t = (a * Math.PI) / 180;
      expect(inside(rects, Math.round(42 + Math.cos(t) * 31), Math.round(42 + Math.sin(t) * 31))).toBe(true);
    }
    expect(inside(rects, 42, 42)).toBe(true);
  });
  it('deja fuera las esquinas transparentes', () => {
    for (const [x, y] of [[1, 1], [82, 1], [1, 82], [82, 82], [8, 8]]) expect(inside(rects, x, y)).toBe(false);
  });
  it('no se sale de la ventana', () => {
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(84);
      expect(r.y + r.height).toBeLessThanOrEqual(84);
    }
  });
});
