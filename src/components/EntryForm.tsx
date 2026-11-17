/**
 * Formulario de imputación (alta y edición). Se usa en la pantalla principal y en el histórico.
 */
import { CalendarDays, ChevronLeft, ChevronRight, Save, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DESCRIPTION_MAX_LENGTH,
  SLOT_MINUTES,
  WORK_TYPES,
  PROJECT_KINDS,
  addDays,
  isAbsenceKind,
  checkDailyLimit,
  formatHours,
  isValidIsoDate,
  todayIso,
  validateDescription,
  validateEntryMinutes,
} from '../../shared/rules';
import type { EntryInput, Project, User, WorkType } from '../../shared/types';
import { HoursPicker } from './HoursPicker';
import { Button, Field, cx, inputClass } from './ui';

export interface EntryFormValues {
  userId: number | null;
  date: string;
  minutes: number;
  projectId: number | null;
  workType: WorkType | null;
  description: string;
}

export function EntryForm({
  values,
  onChange,
  users,
  projects,
  maxMinutes,
  usedMinutes,
  editing,
  onSubmit,
  onCancel,
  onAddUser,
  compact,
}: {
  values: EntryFormValues;
  onChange: (v: EntryFormValues) => void;
  users: User[];
  /** Proyectos seleccionables (activos + el actual si se edita un registro de un proyecto inactivo). */
  projects: Project[];
  /** Jornada máxima configurada. */
  maxMinutes: number;
  /** Minutos ya imputados en el día (sin contar el registro que se edita). */
  usedMinutes: number;
  editing: boolean;
  onSubmit: (input: EntryInput) => Promise<void>;
  onCancel?: () => void;
  onAddUser?: () => void;
  compact?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const available = Math.max(0, maxMinutes - usedMinutes);
  const set = (patch: Partial<EntryFormValues>) => {
    setError(null);
    onChange({ ...values, ...patch });
  };

  // Si el valor supera lo disponible (p. ej. al cambiar de día) se ajusta automáticamente.
  // (también al copiar una tarea más larga que lo que queda del día).
  useEffect(() => {
    if (available >= SLOT_MINUTES && values.minutes > available) onChange({ ...values, minutes: available });
  }, [available, values.minutes]);

  const problems = useMemo(() => {
    const p: Partial<Record<keyof EntryFormValues, string>> = {};
    if (!values.userId) p.userId = 'Selecciona el usuario.';
    if (!isValidIsoDate(values.date)) p.date = 'Fecha no válida.';
    if (!values.projectId) p.projectId = 'Selecciona un proyecto.';
    const proj = projects.find((x) => x.id === values.projectId);
    if ((!values.workType || values.workType === 'ausencia') && (!proj || !isAbsenceKind(proj.kind))) {
      p.workType = 'Selecciona el tipo de trabajo.';
    }
    try {
      validateEntryMinutes(values.minutes);
      checkDailyLimit(usedMinutes, values.minutes, maxMinutes);
    } catch (e) {
      p.minutes = (e as Error).message;
    }
    try {
      validateDescription(values.description);
    } catch (e) {
      p.description = (e as Error).message;
    }
    return p;
  }, [values, usedMinutes, maxMinutes, projects]);

  const dayFull = available < SLOT_MINUTES;
  const selectedProject = projects.find((p) => p.id === values.projectId);
  const isAbsence = !!selectedProject && isAbsenceKind(selectedProject.kind);
  const isShared = selectedProject?.kind === 'shared';
  const absenceInfo = PROJECT_KINDS.find((k) => k.value === selectedProject?.kind);
  const workProjects = projects.filter((p) => p.kind === 'normal');
  const sharedProjects = projects.filter((p) => p.kind === 'shared');
  const absenceProjects = projects.filter((p) => isAbsenceKind(p.kind));

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (saving) return;
    const first = Object.values(problems)[0];
    if (first) {
      setError(first);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        userId: values.userId!,
        projectId: values.projectId!,
        date: values.date,
        minutes: values.minutes,
        workType: isAbsence ? 'ausencia' : values.workType!,
        description: values.description,
      });
      setTouched(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const show = (k: keyof EntryFormValues) => (touched ? problems[k] : undefined);

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
      }}
      className={cx('space-y-5', compact && 'space-y-4')}
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Usuario" required error={show('userId')}>
          <div className="flex gap-1.5">
            <select
              className={inputClass}
              value={values.userId ?? ''}
              onChange={(e) => {
                if (e.target.value === '__new__') onAddUser?.();
                else set({ userId: Number(e.target.value) || null });
              }}
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              {onAddUser && <option value="__new__">+ Nuevo usuario…</option>}
            </select>
          </div>
        </Field>
        <Field label="Fecha" group required error={show('date')}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Día anterior"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
              onClick={() => isValidIsoDate(values.date) && set({ date: addDays(values.date, -1) })}
            >
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="date"
              className={cx(inputClass, 'min-w-0 px-2')}
              value={values.date}
              onChange={(e) => set({ date: e.target.value })}
            />
            <button
              type="button"
              aria-label="Día siguiente"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
              onClick={() => isValidIsoDate(values.date) && set({ date: addDays(values.date, 1) })}
            >
              <ChevronRight className="size-4" />
            </button>
            {values.date !== todayIso() && (
              <button
                type="button"
                title="Ir a hoy"
                aria-label="Ir a hoy"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-50"
                onClick={() => set({ date: todayIso() })}
              >
                <CalendarDays className="size-4" />
              </button>
            )}
          </div>
        </Field>
      </div>

      <Field
        label="Horas"
        group
        required
        hint={dayFull ? 'Jornada completa' : `Disponible: ${formatHours(available)} h`}
        error={show('minutes')}
      >
        <HoursPicker value={values.minutes} onChange={(m) => set({ minutes: m })} max={available} disabled={dayFull} />
      </Field>

      <Field label="Proyecto" required error={show('projectId')}>
        <select
          className={inputClass}
          value={values.projectId ?? ''}
          onChange={(e) => set({ projectId: Number(e.target.value) || null })}
        >
          <option value="" disabled>
            {projects.length ? 'Selecciona un proyecto…' : 'No hay proyectos activos (créalos en «Proyectos»)'}
          </option>
          {sharedProjects.map((p) => (
            <option key={p.id} value={p.id}>
              🌐 {p.name} (tarea común){!p.active ? ' (inactivo)' : ''}
            </option>
          ))}
          {workProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {!p.active ? ' (inactivo)' : ''}
            </option>
          ))}
          {absenceProjects.length > 0 && (
            <optgroup label="Ausencias">
              {absenceProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {PROJECT_KINDS.find((k) => k.value === p.kind)?.emoji} {p.name}
                  {!p.active ? ' (inactivo)' : ''}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Field>

      {isShared && (
        <div className="-mt-2 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-[13px] text-blue-700">
          <span className="text-lg leading-none">🌐</span>
          <span>
            <b>Tarea común a todos los proyectos.</b> Se guarda una sola vez con las horas exactas; en{' '}
            <b>Histórico → Estadísticas</b> podrás verla sin repartir o repartida entre los proyectos.
          </span>
        </div>
      )}

      {isAbsence ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-700">
          <span className="text-lg leading-none">{absenceInfo?.emoji}</span>
          <span>
            Se registrará como <b>ausencia por {absenceInfo?.label.toLowerCase()}</b>. No hace falta elegir tipo de trabajo.
          </span>
        </div>
      ) : (
      <Field label="Tipo de trabajo" group required error={show('workType')}>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {WORK_TYPES.map((w) => (
            <button
              key={w.value}
              type="button"
              aria-pressed={values.workType === w.value}
              onClick={() => set({ workType: w.value })}
              className={cx(
                'h-8 rounded-lg text-[13px] font-medium transition',
                values.workType === w.value
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </Field>
      )}

      <Field
        label="Descripción"
        hint={`${values.description.length}/${DESCRIPTION_MAX_LENGTH}`}
        error={show('description')}
      >
        <textarea
          className={cx(inputClass, 'h-auto resize-none py-2 leading-relaxed')}
          rows={compact ? 2 : 3}
          maxLength={DESCRIPTION_MAX_LENGTH}
          placeholder="Opcional: breve explicación del trabajo realizado"
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={saving}
          disabled={dayFull && !editing}
          icon={<Save className="size-4" />}
          className="flex-1"
        >
          {editing ? 'Guardar cambios' : 'Guardar imputación'}
        </Button>
        {onCancel && (
          <Button size="lg" onClick={onCancel} icon={<X className="size-4" />}>
            Cancelar
          </Button>
        )}
      </div>
      {!compact && <p className="text-center text-xs text-slate-400">Atajo: Ctrl + Enter para guardar</p>}
    </form>
  );
}
