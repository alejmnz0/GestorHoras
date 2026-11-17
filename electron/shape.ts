/**
 * Forma circular del reloj flotante en Linux (setShape): fuera del círculo los clics
 * pasan a las ventanas de debajo. Se aproxima con franjas horizontales de 2 px.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function circleShape(size: number, radius: number): Rect[] {
  const c = size / 2;
  const rects: Rect[] = [];
  for (let y = 0; y < size; y += 2) {
    const dy = Math.abs(y + 1 - c);
    if (dy > radius) continue;
    const half = Math.floor(Math.sqrt(radius * radius - dy * dy));
    rects.push({ x: Math.round(c - half), y, width: half * 2, height: 2 });
  }
  return rects;
}
