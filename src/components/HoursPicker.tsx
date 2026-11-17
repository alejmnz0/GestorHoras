/**
 * Selector de horas en tramos de 15 minutos: valor grande, botones −/+, atajos rápidos
 * y botón «Resto» que rellena lo que queda de jornada.
 */
import { Minus, Plus } from 'lucide-react';
import { SLOT_MINUTES, formatHours, formatHoursLong } from '../../shared/rules';
import { cx } from './ui';

const QUICK = [15, 30, 60, 120, 240];

export function HoursPicker({
  value,
  onChange,
  max,
  disabled,
}: {
  value: number;
  onChange: (minutes: number) => void;
  /** Máximo imputable (disponible en el día). */
  max: number;
  disabled?: boolean;
}) {
  const set = (m: number) => onChange(Math.max(SLOT_MINUTES, Math.min(m, Math.max(max, SLOT_MINUTES))));
  const over = !disabled && value > max;
  return (
    <div>
      <div
        className={cx(
          'flex items-center gap-2 rounded-xl border bg-white p-1.5 shadow-sm',
          over ? 'border-red-300 ring-3 ring-red-500/10' : 'border-slate-200',
        )}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') (e.preventDefault(), set(value + SLOT_MINUTES));
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') (e.preventDefault(), set(value - SLOT_MINUTES));
        }}
      >
        <button
          type="button"
          aria-label="Restar 15 minutos"
          disabled={disabled || value <= SLOT_MINUTES}
          onClick={() => set(value - SLOT_MINUTES)}
          className="flex size-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
        >
          <Minus className="size-4" />
        </button>
        <div className="flex-1 text-center" tabIndex={0} aria-label="Horas" role="spinbutton" aria-valuenow={value / 60}>
          <div className={cx('text-2xl font-semibold tabular-nums tracking-tight', over ? 'text-red-600' : disabled ? 'text-slate-300' : 'text-slate-900')}>
            {formatHours(value)} <span className="text-base font-medium text-slate-400">h</span>
          </div>
          <div className="text-xs text-slate-400">{formatHoursLong(value)}</div>
        </div>
        <button
          type="button"
          aria-label="Sumar 15 minutos"
          disabled={disabled || value + SLOT_MINUTES > max}
          onClick={() => set(value + SLOT_MINUTES)}
          className="flex size-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled || m > max}
            onClick={() => set(m)}
            className={cx(
              'h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums transition disabled:opacity-35',
              value === m
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            {formatHours(m)}
          </button>
        ))}
        {max >= SLOT_MINUTES && !QUICK.includes(max) && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => set(max)}
            title="Imputar todo lo que queda de jornada"
            className={cx(
              'h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums transition',
              value === max
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
            )}
          >
            Resto · {formatHours(max)}
          </button>
        )}
      </div>
    </div>
  );
}
