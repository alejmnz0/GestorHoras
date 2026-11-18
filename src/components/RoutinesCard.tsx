/**
 * Rutinas: grupos de tareas que se repiten (p. ej. las de cada mañana) y se imputan con un clic,
 * o solas cada día laborable si se activa «Imputar automáticamente».
 */
import { CheckCircle2, ListChecks, Pencil, Play, Plus, Save, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DESCRIPTION_MAX_LENGTH,
  PROJECT_KINDS,
  ROUTINE_MAX_ITEMS,
  ROUTINE_NAME_MAX_LENGTH,
  SLOT_MINUTES,
  WORK_TYPES,
  formatDate,
  formatHours,
  isAbsenceKind,
  todayIso,
} from '../../shared/rules';
import type { Project, Routine, RoutineItem, TimeEntry, WorkType } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useToast } from './Toast';
import { Badge, Button, Card, ConfirmDialog, Field, IconButton, Modal, Toggle, cx, inputClass } from './ui';

type Draft = { id: number | null; name: string; autoApply: boolean; items: DraftItem[] };
type DraftItem = { key: number; projectId: number | null; minutes: number; workType: WorkType | null; description: string };

let keySeq = 1;
const newItem = (p?: Partial<DraftItem>): DraftItem => ({
  key: keySeq++,
  projectId: null,
  minutes: 60,
  workType: null,
  description: '',
  ...p,
});

export function RoutinesCard({
  userId,
  date,
  projects,
  dayEntries,
  dataVersion,
  pendingMinutes,
}: {
  userId: number | null;
  date: string;
  /** Proyectos activos. */
  projects: Project[];
  /** Imputaciones del día (para «Guardar el día como rutina»). */
  dayEntries: TimeEntry[];
  dataVersion: number;
  pendingMinutes: number;
}) {
  const toast = useToast();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Routine | null>(null);
  const [reapply, setReapply] = useState<Routine | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return setRoutines([]);
    api.routines
      .list(userId, date)
      .then(setRoutines)
      .catch(() => setRoutines([]));
  }, [userId, date, dataVersion]);

  async function apply(r: Routine) {
    setReapply(null);
    setBusy(r.id);
    try {
      const res = await api.routines.apply(r.id, date);
      const skipped = res.skipped.reduce((s, x) => s + x.minutes, 0);
      if (skipped > 0) {
        toast.show(
          'warning',
          `Rutina «${r.name}» aplicada en parte`,
          `${formatHours(res.minutes)} h imputadas. ${formatHours(skipped)} h no cabían en la jornada o son de proyectos inactivos.`,
        );
      } else {
        toast.success(`Rutina «${r.name}» aplicada`, `${res.created} tarea(s), ${formatHours(res.minutes)} h imputadas.`);
      }
    } catch (e) {
      toast.error('No se pudo aplicar la rutina', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function fromDay() {
    const items = dayEntries
      .filter((e) => projects.some((p) => p.id === e.projectId))
      .slice(0, ROUTINE_MAX_ITEMS)
      .map((e) => newItem({ projectId: e.projectId, minutes: e.minutes, workType: e.workType, description: e.description }));
    setDraft({ id: null, name: '', autoApply: false, items: items.length ? items : [newItem()] });
  }

  const isToday = date === todayIso();

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ListChecks className="size-4 text-slate-400" /> Rutinas
        </h2>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-3.5" />}
          disabled={!userId}
          onClick={() => setDraft({ id: null, name: '', autoApply: false, items: [newItem()] })}
        >
          Nueva rutina
        </Button>
      </div>
      {routines.length === 0 ? (
        <div className="px-5 py-4 text-[13px] text-slate-500">
          <p>
            ¿Haces las mismas tareas cada día? Guárdalas como una <b>rutina</b> y las imputarás todas con un clic (o
            solas cada mañana).
          </p>
          {dayEntries.length > 0 && (
            <Button size="sm" className="mt-3" icon={<Save className="size-3.5" />} onClick={fromDay}>
              Guardar las tareas de este día como rutina
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {routines.map((r) => (
            <li key={r.id} className="group flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-slate-800" title={r.name}>
                    {r.name}
                  </p>
                  {r.autoApply && (
                    <span title="Se imputa sola cada día laborable" className="shrink-0 text-amber-700">
                      <Zap className="size-3.5" />
                    </span>
                  )}
                  {r.appliedOnDate && (
                    <Badge tone="green" className="shrink-0 gap-1">
                      <CheckCircle2 className="size-3" /> {isToday ? 'Hoy' : formatDate(date).slice(0, 5)}
                    </Badge>
                  )}
                </div>
                <p
                  className="mt-0.5 truncate text-xs text-slate-500"
                  title={r.items.map((i) => `${i.projectName} (${formatHours(i.minutes)} h)`).join(', ')}
                >
                  {formatHours(r.totalMinutes)} h · {r.items.map((i) => i.projectName).join(', ')}
                </p>
              </div>
              <div className="hidden shrink-0 group-hover:flex group-focus-within:flex">
                <IconButton
                  label="Editar rutina"
                  onClick={() =>
                    setDraft({
                      id: r.id,
                      name: r.name,
                      autoApply: r.autoApply,
                      items: r.items.map((i) =>
                        newItem({ projectId: i.projectId, minutes: i.minutes, workType: i.workType, description: i.description }),
                      ),
                    })
                  }
                >
                  <Pencil className="size-3.5" />
                </IconButton>
                <IconButton label="Eliminar rutina" tone="danger" onClick={() => setToDelete(r)}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
              <Button
                size="sm"
                variant={r.appliedOnDate ? 'secondary' : 'primary'}
                icon={<Play className="size-3.5" />}
                loading={busy === r.id}
                disabled={pendingMinutes < SLOT_MINUTES}
                title={pendingMinutes < SLOT_MINUTES ? 'La jornada de este día ya está completa' : `Imputar en ${formatDate(date)}`}
                onClick={() => (r.appliedOnDate ? setReapply(r) : apply(r))}
              >
                Imputar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <RoutineEditor
        draft={draft}
        userId={userId}
        projects={projects}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSaved={(name, isNew) => {
          setDraft(null);
          toast.success(isNew ? `Rutina «${name}» creada` : 'Rutina guardada');
        }}
      />
      <ConfirmDialog
        open={!!reapply}
        title="Aplicar de nuevo"
        confirmLabel="Imputar otra vez"
        message={
          reapply && (
            <>
              La rutina <b>{reapply.name}</b> ya se imputó este día. ¿Quieres imputar sus tareas otra vez?
            </>
          )
        }
        onCancel={() => setReapply(null)}
        onConfirm={() => reapply && apply(reapply)}
      />
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Eliminar rutina"
        confirmLabel="Eliminar"
        message={
          toDelete && (
            <>
              ¿Eliminar la rutina <b>{toDelete.name}</b>? Las horas que ya imputaste con ella no se modifican.
            </>
          )
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await api.routines.remove(toDelete.id);
            toast.success('Rutina eliminada');
          } catch (e) {
            toast.error('No se pudo eliminar', errorMessage(e));
          }
          setToDelete(null);
        }}
      />
    </Card>
  );
}

function RoutineEditor({
  draft,
  userId,
  projects,
  onChange,
  onClose,
  onSaved,
}: {
  draft: Draft | null;
  userId: number | null;
  projects: Project[];
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSaved: (name: string, isNew: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [draft?.id, !!draft]);
  if (!draft) return null;

  const total = draft.items.reduce((s, i) => s + i.minutes, 0);
  const setItem = (key: number, patch: Partial<DraftItem>) =>
    onChange({ ...draft, items: draft.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });

  async function save() {
    if (!draft || !userId) return;
    setError(null);
    const missing = draft.items.findIndex((i) => {
      const p = projects.find((x) => x.id === i.projectId);
      return !p || (!isAbsenceKind(p.kind) && !i.workType);
    });
    if (!draft.name.trim()) return setError('Ponle un nombre a la rutina (p. ej. «Mañanas»).');
    if (missing >= 0) return setError(`Completa el proyecto y el tipo de la tarea ${missing + 1}.`);
    setSaving(true);
    try {
      const input = {
        userId,
        name: draft.name,
        autoApply: draft.autoApply,
        items: draft.items.map(
          (i): RoutineItem => ({
            projectId: i.projectId!,
            minutes: i.minutes,
            workType: isAbsenceKind(projects.find((p) => p.id === i.projectId)!.kind) ? 'ausencia' : i.workType!,
            description: i.description,
          }),
        ),
      };
      if (draft.id) await api.routines.update(draft.id, input);
      else await api.routines.create(input);
      onSaved(draft.name.trim(), !draft.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={draft.id ? 'Editar rutina' : 'Nueva rutina'}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <span className="mr-auto self-center text-[13px] text-slate-500">
            Total: <b className="text-slate-800 tabular-nums">{formatHours(total)} h</b>
          </span>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} icon={<Save className="size-4" />} onClick={save}>
            Guardar rutina
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre" required>
          <input
            autoFocus
            className={inputClass}
            maxLength={ROUTINE_NAME_MAX_LENGTH}
            placeholder="p. ej. Tareas de cada mañana"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Tareas</p>
          <div className="space-y-2">
            {draft.items.map((it, idx) => {
              const project = projects.find((p) => p.id === it.projectId);
              const absence = !!project && isAbsenceKind(project.kind);
              return (
                <div key={it.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400">{idx + 1}</span>
                    <select
                      aria-label={`Proyecto de la tarea ${idx + 1}`}
                      className={cx(inputClass, 'min-w-0 flex-1')}
                      value={it.projectId ?? ''}
                      onChange={(e) => setItem(it.key, { projectId: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Proyecto…</option>
                      {projects.map((p) => {
                        const k = PROJECT_KINDS.find((x) => x.value === p.kind);
                        return (
                          <option key={p.id} value={p.id}>
                            {k?.emoji ? `${k.emoji} ` : ''}
                            {p.name}
                          </option>
                        );
                      })}
                    </select>
                    <select
                      aria-label={`Tipo de la tarea ${idx + 1}`}
                      className={cx(inputClass, 'w-40!')}
                      disabled={absence}
                      value={absence ? 'ausencia' : (it.workType ?? '')}
                      onChange={(e) => setItem(it.key, { workType: (e.target.value || null) as WorkType | null })}
                    >
                      {absence ? (
                        <option value="ausencia">Ausencia</option>
                      ) : (
                        <>
                          <option value="">Tipo…</option>
                          {WORK_TYPES.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <MiniHours value={it.minutes} onChange={(m) => setItem(it.key, { minutes: m })} />
                    <IconButton
                      label="Quitar tarea"
                      tone="danger"
                      disabled={draft.items.length === 1}
                      onClick={() => onChange({ ...draft, items: draft.items.filter((x) => x.key !== it.key) })}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                  <input
                    aria-label={`Descripción de la tarea ${idx + 1}`}
                    className={cx(inputClass, 'mt-2 ml-7 w-[calc(100%-1.75rem)]!')}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    placeholder="Descripción (opcional)"
                    value={it.description}
                    onChange={(e) => setItem(it.key, { description: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            icon={<Plus className="size-3.5" />}
            disabled={draft.items.length >= ROUTINE_MAX_ITEMS}
            onClick={() => onChange({ ...draft, items: [...draft.items, newItem()] })}
          >
            Añadir tarea
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
              <Zap className="size-3.5 text-amber-700" /> Imputar automáticamente cada día laborable
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Al abrir la app (o al empezar el día si ya está abierta) se imputará sola una vez. No se aplica en días
              no laborables ni si ese día tienes vacaciones o baja registradas.
            </p>
          </div>
          <Toggle
            checked={draft.autoApply}
            onChange={(v) => onChange({ ...draft, autoApply: v })}
            label="Imputar automáticamente"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}

/** Selector compacto de horas en tramos de 15 min. */
export function MiniHours({
  value,
  onChange,
  min = SLOT_MINUTES,
  max = 24 * 60,
  label = 'Horas',
}: {
  value: number;
  onChange: (m: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const set = (m: number) => onChange(Math.max(min, Math.min(max, m)));
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-white shadow-sm" role="group" aria-label={label}>
      <button
        type="button"
        aria-label="Restar 15 minutos"
        disabled={value <= min}
        onClick={() => set(value - SLOT_MINUTES)}
        className="flex h-9 w-7 items-center justify-center text-slate-500 hover:text-slate-900 disabled:opacity-30"
      >
        −
      </button>
      <span className="w-12 text-center text-sm font-semibold tabular-nums text-slate-800">{formatHours(value)}</span>
      <button
        type="button"
        aria-label="Sumar 15 minutos"
        disabled={value >= max}
        onClick={() => set(value + SLOT_MINUTES)}
        className="flex h-9 w-7 items-center justify-center text-slate-500 hover:text-slate-900 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
