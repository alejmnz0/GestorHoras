/**
 * Configuración → Horarios: varios horarios (normal, verano, intensiva…) con las horas de cada día
 * de la semana. Uno es el principal y los que tienen un periodo (p. ej. 15/06 - 15/09) se aplican
 * solos durante esas fechas.
 */
import { CalendarRange, Check, Plus, RotateCcw, Save, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  MAX_SCHEDULES,
  SCHEDULE_NAME_MAX_LENGTH,
  SCHEDULE_TEMPLATES,
  SLOT_MINUTES,
  WEEKDAYS,
  describeSchedule,
  formatHours,
  formatMonthDay,
  scheduleFor,
  todayIso,
  validateSchedules,
} from '../../shared/rules';
import type { Settings, WorkSchedule } from '../../shared/types';
import { errorMessage } from '../lib/api';
import { useToast } from './Toast';
import { Badge, Button, IconButton, Toggle, cx, inputClass } from './ui';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const newId = () => `h-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function ScheduleSettings({
  settings,
  save,
}: {
  settings: Settings;
  save: (patch: Partial<Settings>, okMsg?: string) => Promise<void>;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<WorkSchedule[]>(settings.schedules);
  const [activeId, setActiveId] = useState<string | null>(settings.activeScheduleId);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  // Si la configuración cambia desde fuera (otra ventana, restaurar…), se recarga el borrador.
  const savedKey = JSON.stringify([settings.schedules, settings.activeScheduleId]);
  useEffect(() => {
    setDraft(settings.schedules);
    setActiveId(settings.activeScheduleId);
  }, [savedKey]);

  const dirty = JSON.stringify([draft, activeId]) !== savedKey;
  const today = todayIso();
  const todaySchedule = scheduleFor(today, settings);
  const error = useMemo(() => {
    try {
      validateSchedules(draft);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }, [draft]);

  const update = (id: string, patch: Partial<WorkSchedule>) =>
    setDraft((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function persist() {
    if (error) return toast.error('Revisa los horarios', error);
    setSaving(true);
    try {
      await save({ schedules: draft, activeScheduleId: activeId }, 'Horarios guardados');
    } finally {
      setSaving(false);
    }
  }

  function add(template?: (typeof SCHEDULE_TEMPLATES)[number]) {
    const base = template ? template.make() : { name: 'Nuevo horario', minutes: [0, 480, 480, 480, 480, 480, 0], period: null };
    let name = base.name;
    for (let i = 2; draft.some((x) => x.name.toLowerCase() === name.toLowerCase()); i++) name = `${base.name} ${i}`;
    setDraft((d) => [...d, { ...base, name, id: newId() }]);
    setAdding(false);
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[13px] text-brand-700">
        <CalendarRange className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          Hoy se aplica <b>{todaySchedule.name}</b>: {describeSchedule(todaySchedule)}
        </span>
      </div>

      {draft.map((sch) => (
        <ScheduleCard
          key={sch.id}
          schedule={sch}
          isMain={sch.id === activeId}
          canDelete={draft.length > 1}
          onMakeMain={() => setActiveId(sch.id)}
          onChange={(p) => update(sch.id, p)}
          onDelete={() => {
            setDraft((d) => d.filter((x) => x.id !== sch.id));
            if (activeId === sch.id) setActiveId(draft.find((x) => x.id !== sch.id)?.id ?? null);
          }}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Button
            size="sm"
            icon={<Plus className="size-3.5" />}
            disabled={draft.length >= MAX_SCHEDULES}
            onClick={() => setAdding((v) => !v)}
          >
            Añadir horario
          </Button>
          {adding && (
            <div className="pop-in absolute left-0 z-20 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              {SCHEDULE_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => add(t)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100"
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => add()}
                className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-500 hover:bg-slate-100"
              >
                En blanco…
              </button>
            </div>
          )}
        </div>
        {dirty && (
          <>
            <span className="ml-auto text-xs text-amber-700">{error ?? 'Cambios sin guardar'}</span>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw className="size-3.5" />}
              onClick={() => {
                setDraft(settings.schedules);
                setActiveId(settings.activeScheduleId);
              }}
            >
              Descartar
            </Button>
            <Button size="sm" variant="primary" loading={saving} disabled={!!error} icon={<Save className="size-3.5" />} onClick={persist}>
              Guardar horarios
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Los días en 0 h no son laborables (sin recordatorios ni jornada esperada). El horario principal rige todo el año
        salvo en los periodos de los horarios de temporada.
      </p>
    </div>
  );
}

function ScheduleCard({
  schedule,
  isMain,
  canDelete,
  onMakeMain,
  onChange,
  onDelete,
}: {
  schedule: WorkSchedule;
  isMain: boolean;
  canDelete: boolean;
  onMakeMain: () => void;
  onChange: (p: Partial<WorkSchedule>) => void;
  onDelete: () => void;
}) {
  const weekly = schedule.minutes.reduce((s, m) => s + m, 0);
  const setDay = (d: number, m: number) =>
    onChange({ minutes: schedule.minutes.map((x, i) => (i === d ? Math.max(0, Math.min(24 * 60, m)) : x)) });

  return (
    <div className={cx('rounded-xl border p-3.5', isMain ? 'border-brand-500/60 ring-3 ring-brand-500/10' : 'border-slate-200')}>
      <div className="flex items-center gap-2">
        <input
          aria-label="Nombre del horario"
          className={cx(inputClass, 'h-8! w-56! font-medium')}
          maxLength={SCHEDULE_NAME_MAX_LENGTH}
          value={schedule.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {isMain ? (
          <Badge tone="blue" className="gap-1">
            <Star className="size-3" /> Principal
          </Badge>
        ) : (
          <Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} onClick={onMakeMain}>
            Hacer principal
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-500 tabular-nums">{formatHours(weekly)} h/semana</span>
        <IconButton label="Eliminar horario" tone="danger" disabled={!canDelete} onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d) => {
          const m = schedule.minutes[d.value] ?? 0;
          const on = m > 0;
          return (
            <div
              key={d.value}
              className={cx('rounded-lg border px-1 py-1.5 text-center', on ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50')}
            >
              <button
                type="button"
                title={on ? `${d.label}: marcar como no laborable` : `${d.label}: marcar como laborable`}
                aria-pressed={on}
                onClick={() => setDay(d.value, on ? 0 : Math.max(...schedule.minutes, 480))}
                className={cx(
                  'mx-auto flex size-6 items-center justify-center rounded-md text-xs font-semibold transition',
                  on ? 'bg-brand-600 text-on-accent' : 'bg-slate-200 text-slate-500 hover:bg-slate-300',
                )}
              >
                {d.short}
              </button>
              <p className={cx('mt-1 text-[13px] font-semibold tabular-nums', on ? 'text-slate-800' : 'text-slate-400')}>
                {on ? formatHours(m) : '—'}
              </p>
              <div className="mt-0.5 flex justify-center gap-0.5">
                <button
                  type="button"
                  aria-label={`Restar 15 minutos el ${d.label}`}
                  disabled={!on}
                  onClick={() => setDay(d.value, m - SLOT_MINUTES)}
                  className="flex size-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={`Sumar 15 minutos el ${d.label}`}
                  onClick={() => setDay(d.value, m + SLOT_MINUTES)}
                  className="flex size-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
        <Toggle
          checked={!!schedule.period}
          onChange={(v) => onChange({ period: v ? { from: '06-15', to: '09-15' } : null })}
          label="Aplicar solo en un periodo del año"
        />
        <span>Aplicar automáticamente cada año</span>
        {schedule.period ? (
          <>
            <span>del</span>
            <MonthDayPicker value={schedule.period.from} onChange={(from) => onChange({ period: { ...schedule.period!, from } })} />
            <span>al</span>
            <MonthDayPicker value={schedule.period.to} onChange={(to) => onChange({ period: { ...schedule.period!, to } })} />
            {isMain && (
              <span className="text-xs text-amber-700">
                (al ser el principal se usa todo el año; marca otro como principal)
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-slate-400">(p. ej. horario de verano)</span>
        )}
        {schedule.period && !isMain && (
          <span className="flex items-center gap-1 text-xs text-emerald-700">
            <Check className="size-3.5" /> {formatMonthDay(schedule.period.from)} - {formatMonthDay(schedule.period.to)}
          </span>
        )}
      </div>
    </div>
  );
}

function MonthDayPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [m, d] = value.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sel = cx(inputClass, 'h-8! w-auto! px-2!');
  return (
    <span className="inline-flex gap-1">
      <select
        aria-label="Día"
        className={sel}
        value={d}
        onChange={(e) => onChange(`${pad(m)}-${pad(Number(e.target.value))}`)}
      >
        {Array.from({ length: DAYS_IN_MONTH[m - 1] }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select
        aria-label="Mes"
        className={sel}
        value={m}
        onChange={(e) => {
          const nm = Number(e.target.value);
          onChange(`${pad(nm)}-${pad(Math.min(d, DAYS_IN_MONTH[nm - 1]))}`);
        }}
      >
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
    </span>
  );
}
