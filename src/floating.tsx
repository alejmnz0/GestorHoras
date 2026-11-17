/**
 * Reloj flotante: ventana independiente, pequeña y siempre visible.
 *  - Clic: abre la ventana de imputación.
 *  - Arrastrar: mueve el reloj (se recuerda la posición).
 *  - Clic derecho: menú (posponer, pausar, abrir, salir).
 *  - Anillo de progreso con las horas imputadas hoy.
 *  - Recordatorio: se agita, suena y muestra un punto naranja hasta que se pulsa.
 */
import { Clock } from 'lucide-react';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { formatHours } from '../shared/rules';
import type { DaySummary } from '../shared/types';
import { api } from './lib/api';
import { playChime } from './lib/sound';
import './index.css';

const DRAG_THRESHOLD = 4;
const R = 25;
const CIRC = 2 * Math.PI * R;

function FloatingClock() {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [alerting, setAlerting] = useState(false);
  const [shaking, setShaking] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hovering = useRef(false);

  useEffect(() => {
    const load = () => api.floating.summary().then(setSummary).catch(() => setSummary(null));
    load();
    const t = setInterval(load, 60_000);
    const offs = [
      api.on.dataChanged(load),
      api.on.settingsChanged(load),
      api.on.floatingShown(() => {
        hovering.current = false;
        load();
      }),
      api.on.reminder((a) => {
        setAlerting(true);
        if (a.sound) playChime(a.volume);
        if (a.animation) {
          setShaking(false);
          requestAnimationFrame(() => setShaking(true));
        }
      }),
    ];
    return () => {
      clearInterval(t);
      offs.forEach((o) => o());
    };
  }, []);

  const setIgnore = (ignore: boolean) => api.floating.setIgnoreMouse(ignore);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.screenX, y: e.screenY, moved: false };
    api.floating.dragStart();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.screenX - d.x;
    const dy = e.screenY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true;
    if (d.moved) api.floating.dragMove(dx, dy);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.moved) {
      api.floating.dragEnd();
    } else {
      setAlerting(false);
      hovering.current = false;
      api.floating.click();
    }
    if (!hovering.current) setIgnore(true);
  };

  const pct = summary ? Math.min(100, summary.percent) : 0;
  const complete = !!summary?.complete;
  const color = alerting ? '#f97316' : complete ? '#16a34a' : '#2563eb';
  const tooltip = summary
    ? `Hoy: ${formatHours(summary.imputedMinutes)} h de ${formatHours(summary.maxMinutes)} h · pendientes ${formatHours(summary.pendingMinutes)} h\nClic: imputar horas · Arrastrar: mover · Clic derecho: opciones`
    : 'Clic para imputar horas';

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div
        data-testid="floating-clock"
        title={tooltip}
        onPointerEnter={() => {
          hovering.current = true;
          setIgnore(false);
        }}
        onPointerLeave={() => {
          hovering.current = false;
          if (!drag.current) setIgnore(true);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          api.floating.contextMenu();
        }}
        onAnimationEnd={() => setShaking(false)}
        className={`relative flex size-14 cursor-pointer items-center justify-center rounded-full bg-white/95 shadow-[0_4px_14px_rgba(15,23,42,0.22)] ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95 ${shaking ? 'shake' : ''}`}
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" aria-hidden>
          <circle cx="28" cy="28" r={R} fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="28"
            cy="28"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 600ms ease, stroke 300ms' }}
          />
        </svg>
        <Clock className="size-6" style={{ color }} strokeWidth={2.2} />
        {alerting && (
          <span className="absolute -top-0.5 -right-0.5 flex size-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex size-3.5 rounded-full border-2 border-white bg-orange-500" />
          </span>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FloatingClock />
  </StrictMode>,
);
