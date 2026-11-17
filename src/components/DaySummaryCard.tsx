import { CheckCircle2, Clock3 } from 'lucide-react';
import { formatHours, formatPercent } from '../../shared/rules';
import type { DaySummary } from '../../shared/types';
import { Card, cx } from './ui';

export function DaySummaryCard({ summary }: { summary: DaySummary | null }) {
  const s = summary;
  const pct = s ? Math.min(100, s.percent) : 0;
  const complete = !!s?.complete;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-slate-500">Jornada del día</p>
          <p className="mt-0.5 text-sm text-slate-400">{s ? `${formatHours(s.maxMinutes)} horas` : '—'}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
        {!!s?.vacationMinutes && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            🌴 Vacaciones
          </span>
        )}
        {!!s?.sickMinutes && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            🩺 Baja
          </span>
        )}
        {complete ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="size-3.5" /> Día completado
          </span>
        ) : s && !s.workday && s.imputedMinutes === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
            Día no laborable
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
            <Clock3 className="size-3.5" /> Pendiente
          </span>
        )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat label="Imputadas" value={s ? formatHours(s.imputedMinutes) : '–'} tone="text-slate-900" />
        <Stat
          label="Pendientes"
          value={s ? formatHours(s.pendingMinutes) : '–'}
          tone={complete ? 'text-emerald-600' : 'text-orange-600'}
        />
        <Stat label="Progreso" value={s ? formatPercent(pct) : '–'} tone="text-brand-700" raw />
      </div>

      <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100" aria-label="Progreso de la jornada">
        <div
          className={cx(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            complete ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-500 to-brand-600',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
}

function Stat({ label, value, tone, raw }: { label: string; value: string; tone: string; raw?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cx('mt-0.5 font-semibold whitespace-nowrap tabular-nums tracking-tight', raw ? 'text-lg leading-7' : 'text-xl', tone)}>
        {value}
        {!raw && <span className="ml-0.5 text-sm font-medium text-slate-400">h</span>}
      </p>
    </div>
  );
}
