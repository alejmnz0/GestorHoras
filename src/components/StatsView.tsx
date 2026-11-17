/**
 * Estadísticas del histórico: horas por proyecto, % de dedicación, cobertura de la jornada,
 * distribución por tipo, evolución diaria y días pendientes de completar.
 * Usa los mismos filtros que la tabla de registros.
 */
import { BarChart3, CalendarCheck2, CalendarX2, Gauge, Hourglass, Stethoscope, Palmtree, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  PROJECT_KINDS,
  SHARED_DISTRIBUTIONS,
  formatDate,
  formatHours,
  formatPercent,
  isAbsenceKind,
  isWorkKind,
  workTypeLabel,
} from '../../shared/rules';
import type { SharedDistribution, StatsResult, WorkType } from '../../shared/types';
import { Badge, Button, Card, EmptyState, cx } from './ui';

const TYPE_COLOR: Record<WorkType, string> = {
  desarrollo: 'bg-blue-500',
  incidencia: 'bg-[#ef4444]',
  mantenimiento: 'bg-violet-500',
  ausencia: 'bg-emerald-500',
};

export function StatsView({
  stats,
  userName,
  maxDailyMinutes,
  onOpenDay,
  distribution,
  onDistributionChange,
}: {
  distribution: SharedDistribution;
  onDistributionChange: (d: SharedDistribution) => void;
  stats: StatsResult | null;
  userName: string | null;
  maxDailyMinutes: number;
  onOpenDay: (date: string, userId: number | null) => void;
}) {
  if (!stats) return null;
  if (stats.entryCount === 0 && !stats.expectedMinutes) {
    return (
      <Card>
        <EmptyState icon={<BarChart3 className="size-5" />} title="No hay datos para estas estadísticas">
          Elige un periodo (por ejemplo «Este mes») o cambia los filtros.
        </EmptyState>
      </Card>
    );
  }
  const s = stats;
  const workProjects = s.byProject.filter((p) => isWorkKind(p.kind));
  const absenceProjects = s.byProject.filter((p) => isAbsenceKind(p.kind));
  const distributed = s.distribution !== 'none';
  const maxProject = Math.max(1, ...workProjects.map((p) => p.minutes));

  return (
    <div className="space-y-4 pb-6">
      <p className="text-[13px] text-slate-500">
        {s.dateFrom && s.dateTo ? (
          <>
            Del <b className="text-slate-700">{formatDate(s.dateFrom)}</b> al <b className="text-slate-700">{formatDate(s.dateTo)}</b>
          </>
        ) : (
          'Todo el histórico'
        )}
        {userName ? (
          <>
            {' '}· <b className="text-slate-700">{userName}</b>
          </>
        ) : (
          ' · varios usuarios (la jornada esperada se calcula al filtrar por un usuario)'
        )}
      </p>

      <div className="grid grid-cols-4 gap-3">
        <Kpi
          icon={<Hourglass className="size-4" />}
          label="Horas imputadas"
          value={`${formatHours(s.totalMinutes)} h`}
          sub={`Trabajo ${formatHours(s.workMinutes)} h · ausencias ${formatHours(s.vacationMinutes + s.sickMinutes)} h`}
        />
        <Kpi
          icon={<CalendarCheck2 className="size-4" />}
          label="Jornada esperada"
          value={s.expectedMinutes !== null ? `${formatHours(s.expectedMinutes)} h` : '—'}
          sub={
            s.workingDays !== null
              ? `${s.workingDays} días laborables × ${formatHours(maxDailyMinutes)} h`
              : 'Filtra por un usuario y un periodo'
          }
        />
        <Kpi
          icon={<Gauge className="size-4" />}
          label="Cobertura de la jornada"
          value={s.coveragePercent !== null ? formatPercent(s.coveragePercent) : '—'}
          sub={
            s.coveragePercent !== null ? (
              <div>
              <p>{s.elapsedWorkingDays} días laborables hasta hoy</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cx('h-full rounded-full', s.coveragePercent >= 100 ? 'bg-emerald-500' : 'bg-brand-600')}
                  style={{ width: `${s.coveragePercent}%` }}
                />
              </div>
              </div>
            ) : s.coveragePartial ? (
              'No aplica con filtros de proyecto, tipo o búsqueda'
            ) : s.elapsedWorkingDays === 0 ? (
              'Aún no ha pasado ningún día laborable'
            ) : (
              'Filtra por un usuario y un periodo'
            )
          }
        />
        <Kpi
          icon={<TrendingUp className="size-4" />}
          label="Media diaria de trabajo"
          value={`${formatHours(s.avgWorkMinutesPerDay)} h`}
          sub={`${s.daysWithEntries} día(s) con imputaciones · ${s.entryCount} registro(s)`}
        />
        <Kpi
          icon={<Palmtree className="size-4" />}
          label="Vacaciones"
          value={`${s.vacationDays} día(s)`}
          sub={`${formatHours(s.vacationMinutes)} h`}
          tone="green"
        />
        <Kpi
          icon={<Stethoscope className="size-4" />}
          label="Baja laboral"
          value={`${s.sickDays} día(s)`}
          sub={`${formatHours(s.sickMinutes)} h`}
          tone="blue"
        />
        <Kpi
          icon={<CalendarX2 className="size-4" />}
          label="Días por completar"
          value={s.coveragePercent !== null ? String(s.incompleteDays.length) : '—'}
          sub={
            s.coveragePercent !== null
              ? `${formatHours(s.incompleteDays.reduce((a, d) => a + d.pendingMinutes, 0))} h pendientes hasta hoy`
              : '—'
          }
          tone={s.incompleteDays.length ? 'orange' : 'green'}
        />
        <Kpi
          icon={<BarChart3 className="size-4" />}
          label="Proyectos con horas"
          value={String(workProjects.filter((p) => p.kind === 'normal').length)}
          sub={workProjects.find((p) => p.kind === 'normal') ? `Principal: ${workProjects.find((p) => p.kind === 'normal')!.name}` : '—'}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-7">
          <CardTitle
            title="Horas por proyecto"
            hint={
              distributed && s.narrowed
                ? '% sobre el trabajo de todo el periodo (sin filtrar)'
                : '% sobre las horas de trabajo'
            }
          />
          {s.sharedMinutes > 0 && (
            <div className="mx-5 mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-blue-700">
                  🌐 <b>{formatHours(s.sharedMinutes)} h</b> de tareas comunes
                </p>
                <div className="flex rounded-lg bg-white p-0.5 shadow-sm" role="radiogroup" aria-label="Reparto de tareas comunes">
                  {SHARED_DISTRIBUTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      role="radio"
                      aria-checked={distribution === d.value}
                      title={d.hint}
                      onClick={() => onDistributionChange(d.value)}
                      className={cx(
                        'h-7 rounded-md px-2.5 text-xs font-medium transition',
                        distribution === d.value ? 'bg-brand-600 text-on-accent' : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1.5 text-xs text-blue-700/80">
                {distributed
                  ? `${SHARED_DISTRIBUTIONS.find((d) => d.value === s.distribution)?.hint} Repartido entre ${s.distributionTargets} proyecto(s). Solo es una vista: lo imputado no cambia y el total cuadra.`
                  : 'Se muestran en su propia línea. Elige un reparto para ver cuánto supondrían en cada proyecto.'}
              </p>
            </div>
          )}
          {workProjects.length === 0 && absenceProjects.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-slate-500">Sin datos.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="px-5 pb-2 font-medium">Proyecto</th>
                  <th className="w-[34%] pb-2 font-medium" />
                  <th className="pb-2 text-right font-medium">Horas</th>
                  <th className="pb-2 text-right font-medium">%</th>
                  <th className="px-5 pb-2 text-right font-medium">Reg.</th>
                </tr>
              </thead>
              <tbody>
                {workProjects.map((p) => (
                  <tr
                    key={p.projectId}
                    className={cx('border-t border-slate-100', p.kind === 'shared' && 'bg-blue-50/50')}
                    title={
                      distributed
                        ? `${p.name}: ${formatHours(p.directMinutes)} h directas + ${formatHours(p.sharedMinutes)} h comunes`
                        : `${p.name}: ${formatHours(p.minutes)} h (${formatPercent(p.percent)})`
                    }
                  >
                    <td className="max-w-0 px-5 py-2">
                      <p className="truncate font-medium text-slate-800">
                        {p.kind === 'shared' && '🌐 '}
                        {p.name}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {p.code}
                        {!p.active && ' · inactivo'}
                      </p>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cx('h-full', p.kind === 'shared' ? 'bg-blue-400' : 'bg-brand-600', p.sharedMinutes === 0 && 'rounded-r-full')}
                          style={{ width: `${(p.directMinutes / maxProject) * 100}%` }}
                        />
                        {p.sharedMinutes > 0 && (
                          <div className="h-full rounded-r-full bg-blue-400" style={{ width: `${(p.sharedMinutes / maxProject) * 100}%` }} />
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <p className="font-semibold text-slate-900">{formatHours(p.minutes)}</p>
                      {p.sharedMinutes > 0 && (
                        <p className="text-[11px] text-slate-400">
                          {formatHours(p.directMinutes)} + <span className="text-blue-600">{formatHours(p.sharedMinutes)}</span>
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{formatPercent(p.percent)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-slate-400">{p.entries}</td>
                  </tr>
                ))}
                {absenceProjects.map((p) => {
                  const k = PROJECT_KINDS.find((x) => x.value === p.kind);
                  return (
                    <tr key={p.projectId} className="border-t border-dashed border-slate-200 text-slate-500">
                      <td className="px-5 py-2" colSpan={2}>
                        {k?.emoji} {p.name} <Badge tone="green">{k?.label}</Badge>
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">{formatHours(p.minutes)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-400">—</td>
                      <td className="px-5 py-2 text-right tabular-nums text-slate-400">{p.entries}</td>
                    </tr>
                  );
                })}
              </tbody>
              {workProjects.length > 0 && (
                <tfoot>
                  {distributed && (
                    <tr>
                      <td colSpan={5} className="px-5 pt-2 text-xs text-slate-400">
                        <span className="mr-3 inline-flex items-center gap-1.5">
                          <span className="size-2.5 rounded-sm bg-brand-600" /> Horas directas
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2.5 rounded-sm bg-blue-400" /> Parte de tareas comunes
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-200 font-semibold text-slate-800">
                    <td className="px-5 py-2.5" colSpan={2}>
                      Total trabajo
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatHours(s.workMinutes)}</td>
                    <td className="py-2.5 text-right tabular-nums">100 %</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </Card>

        <div className="col-span-5 space-y-4">
          <Card>
            <CardTitle title="Por tipo de trabajo" />
            <div className="px-5 pb-5">
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                {s.byWorkType.map((w) => (
                  <div
                    key={w.workType}
                    className={cx('h-full first:rounded-l-full last:rounded-r-full', TYPE_COLOR[w.workType])}
                    style={{ width: `${w.percent}%` }}
                    title={`${workTypeLabel(w.workType)}: ${formatHours(w.minutes)} h (${formatPercent(w.percent)})`}
                  />
                ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {s.byWorkType.map((w) => (
                  <li key={w.workType} className="flex items-center gap-2 text-[13px]">
                    <span className={cx('size-2.5 rounded-sm', TYPE_COLOR[w.workType])} />
                    <span className="flex-1 text-slate-600">{workTypeLabel(w.workType)}</span>
                    <span className="font-semibold tabular-nums text-slate-800">{formatHours(w.minutes)} h</span>
                    <span className="w-16 text-right tabular-nums text-slate-400">{formatPercent(w.percent)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardTitle
              title="Días por completar"
              hint={s.coveragePercent === null ? undefined : s.incompleteDays.length ? 'Hasta hoy' : undefined}
            />
            {s.coveragePercent === null ? (
              <p className="px-5 pb-5 text-[13px] text-slate-500">
                {s.coveragePartial
                  ? 'Quita los filtros de proyecto, tipo o búsqueda para ver los días pendientes.'
                  : s.elapsedWorkingDays === 0
                    ? 'Aún no ha transcurrido ningún día laborable de este periodo.'
                    : 'Filtra por un usuario y un periodo para ver los días pendientes.'}
              </p>
            ) : s.incompleteDays.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] font-medium text-emerald-600">✓ Todos los días laborables están completos.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
                {s.incompleteDays.map((d) => (
                  <li key={d.date} className="flex items-center gap-3 px-5 py-2 text-[13px]">
                    <span className="w-24 tabular-nums text-slate-700">{formatDate(d.date)}</span>
                    <span className="flex-1 text-slate-500">
                      {formatHours(d.imputedMinutes)} h · faltan{' '}
                      <b className="font-semibold text-orange-600">{formatHours(d.pendingMinutes)} h</b>
                    </span>
                    <Button size="sm" variant="subtle" onClick={() => onOpenDay(d.date, s.userId)}>
                      Imputar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {s.byDay.length > 1 && <DailyChart days={s.byDay} maxDaily={maxDailyMinutes} truncated={s.byDayTruncated} />}
    </div>
  );
}

function DailyChart({ days, maxDaily, truncated }: { days: StatsResult['byDay']; maxDaily: number; truncated: boolean }) {
  const top = Math.max(maxDaily, ...days.map((d) => d.minutes));
  const H = 140;
  const every = Math.max(1, Math.ceil(days.length / 12));
  return (
    <Card>
      <CardTitle
        title="Evolución diaria"
        hint={`${truncated ? 'Últimos 92 días · ' : ''}La línea marca la jornada de ${formatHours(maxDaily)} h`}
      />
      <div className="px-5 pb-4">
        <div className="relative flex items-end gap-[2px]" style={{ height: H }}>
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-300"
            style={{ bottom: (maxDaily / top) * H }}
          />
          {days.map((d) => (
            <div
              key={d.date}
              className="group relative flex h-full flex-1 items-end"
              title={`${formatDate(d.date)}: ${formatHours(d.minutes)} h${d.workday ? '' : ' (no laborable)'}`}
            >
              <div
                className={cx(
                  'w-full rounded-t-[4px] transition-colors',
                  d.minutes >= maxDaily ? 'bg-emerald-500' : d.workday ? 'bg-brand-500' : 'bg-slate-300',
                  'group-hover:opacity-80',
                )}
                style={{ height: d.minutes ? Math.max(2, (d.minutes / top) * H) : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-[2px] border-t border-slate-200 pt-1">
          {days.map((d, i) => (
            <span key={d.date} className="flex-1 text-center text-[10px] text-slate-400 tabular-nums">
              {i % every === 0 ? formatDate(d.date).slice(0, 5) : ''}
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-slate-500">
          <Legend className="bg-brand-500" label="Día laborable" />
          <Legend className="bg-emerald-500" label="Jornada completa" />
          <Legend className="bg-slate-300" label="No laborable" />
        </div>
      </div>
    </Card>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('size-2.5 rounded-sm', className)} />
      {label}
    </span>
  );
}

function CardTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between px-5 pt-4 pb-3">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone = 'brand',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: 'brand' | 'green' | 'blue' | 'orange';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className={cx('flex size-7 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
        <p className="text-[13px] text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
      {sub && <div className="mt-0.5 truncate text-xs text-slate-400">{sub}</div>}
    </Card>
  );
}
