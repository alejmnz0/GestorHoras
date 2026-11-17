/**
 * Pantalla principal: imputación rápida de horas y estado del día seleccionado.
 */
import { ClipboardList, MonitorDown, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateLong, formatHours, todayIso, workTypeLabel } from '../../shared/rules';
import type { DayData, Project, TimeEntry } from '../../shared/types';
import { DaySummaryCard } from '../components/DaySummaryCard';
import { EntryForm, type EntryFormValues } from '../components/EntryForm';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, PageHeader, cx, workTypeTone } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/appContext';

const emptyValues = (userId: number | null, date: string, keep?: Partial<EntryFormValues>): EntryFormValues => ({
  userId,
  date,
  minutes: 60,
  projectId: keep?.projectId ?? null,
  workType: keep?.workType ?? null,
  description: '',
});

export function ImputarPage({ onAddUser }: { onAddUser: () => void }) {
  const { settings, users, dataVersion, updateSettings } = useApp();
  const toast = useToast();
  const [values, setValues] = useState<EntryFormValues>(() => emptyValues(settings.currentUserId, todayIso()));
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [day, setDay] = useState<DayData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [toDelete, setToDelete] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const editingRef = useRef<TimeEntry | null>(null);
  editingRef.current = editingEntry;

  // Si la app sigue abierta al cambiar de día, el formulario pasa a la nueva fecha
  // (solo si estaba en "hoy" y no se está editando).
  useEffect(() => {
    let lastToday = todayIso();
    const check = () => {
      const now = todayIso();
      if (now === lastToday) return;
      setValues((v) => (v.date === lastToday && !editingRef.current ? { ...v, date: now } : v));
      lastToday = now;
    };
    const t = setInterval(check, 30_000);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', check);
    };
  }, []);

  // El usuario seleccionado se recuerda en la configuración.
  useEffect(() => {
    setValues((v) => (v.userId === settings.currentUserId ? v : { ...v, userId: settings.currentUserId }));
  }, [settings.currentUserId]);

  const loadDay = useCallback(async () => {
    if (!values.userId) return setDay(null);
    try {
      setDay(await api.entries.day(values.userId, values.date));
    } catch {
      setDay(null);
    }
  }, [values.userId, values.date]);

  useEffect(() => {
    void loadDay();
  }, [loadDay, dataVersion, settings.maxDailyMinutes]);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => setProjects([]));
  }, [dataVersion]);

  // Si el proyecto seleccionado deja de estar activo, se deselecciona (salvo al editar ese registro).
  useEffect(() => {
    if (values.projectId && !editingEntry && projects.length && !projects.some((p) => p.id === values.projectId)) {
      setValues((v) => ({ ...v, projectId: null }));
    }
  }, [projects, values.projectId, editingEntry]);

  const onChange = (v: EntryFormValues) => {
    if (v.userId !== values.userId && v.userId) {
      updateSettings({ currentUserId: v.userId }).catch((e) => toast.error('No se pudo cambiar el usuario', errorMessage(e)));
    }
    setValues(v);
  };

  const usedMinutes = (day?.entries ?? [])
    .filter((e) => e.id !== editingEntry?.id)
    .reduce((s, e) => s + e.minutes, 0);

  const selectableProjects =
    editingEntry && !projects.some((p) => p.id === editingEntry.projectId)
      ? [
          ...projects,
          {
            id: editingEntry.projectId,
            code: editingEntry.projectCode,
            name: editingEntry.projectName,
            active: false,
            entryCount: 1,
            createdAt: '',
            updatedAt: '',
          },
        ]
      : projects;

  function startEdit(e: TimeEntry) {
    setEditingEntry(e);
    setValues({
      userId: e.userId,
      date: e.date,
      minutes: e.minutes,
      projectId: e.projectId,
      workType: e.workType,
      description: e.description,
    });
  }

  function cancelEdit() {
    setEditingEntry(null);
    setValues((v) => emptyValues(v.userId, v.date));
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.entries.remove(toDelete.id);
      if (editingEntry?.id === toDelete.id) cancelEdit();
      toast.success('Imputación eliminada');
      setToDelete(null);
    } catch (e) {
      toast.error('No se pudo eliminar', errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Imputar horas"
        subtitle={formatDateLong(values.date)}
        actions={
          <Button
            variant="subtle"
            icon={<MonitorDown className="size-4" />}
            onClick={() => api.window.toFloating()}
            title="Oculta esta ventana y deja un pequeño reloj flotante en el escritorio"
          >
            Minimizar a reloj flotante
          </Button>
        }
      />

      <div className="grid grid-cols-12 gap-6">
        <Card className={cx('col-span-7 p-6', editingEntry && 'ring-2 ring-brand-500/30')}>
          {editingEntry && (
            <div className="-mt-1 mb-4 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[13px] text-brand-700">
              <Pencil className="size-3.5" /> Editando la imputación de <b>{editingEntry.projectName}</b>
            </div>
          )}
          <EntryForm
            values={values}
            onChange={onChange}
            users={users}
            projects={selectableProjects}
            maxMinutes={day?.summary.maxMinutes ?? settings.maxDailyMinutes}
            usedMinutes={usedMinutes}
            editing={!!editingEntry}
            onAddUser={onAddUser}
            onCancel={editingEntry ? cancelEdit : undefined}
            onSubmit={async (input) => {
              if (editingEntry) {
                await api.entries.update(editingEntry.id, input);
                toast.success('Cambios guardados');
                setEditingEntry(null);
                setValues((v) => emptyValues(v.userId, v.date));
              } else {
                await api.entries.create(input);
                toast.success('Imputación guardada', `${formatHours(input.minutes)} h registradas`);
                // Se mantiene proyecto y tipo para agilizar imputaciones seguidas.
                setValues((v) => emptyValues(v.userId, v.date, v));
              }
            }}
          />
        </Card>

        <div className="col-span-5 space-y-6">
          <DaySummaryCard summary={day?.summary ?? null} />

          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-slate-800">Imputaciones del día</h2>
              <span className="text-xs text-slate-400">{day?.entries.length ?? 0} registro(s)</span>
            </div>
            {!day || day.entries.length === 0 ? (
              <EmptyState icon={<ClipboardList className="size-5" />} title="Sin imputaciones este día">
                Las horas que guardes aparecerán aquí.
              </EmptyState>
            ) : (
              <ul className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                {day.entries.map((e) => (
                  <li
                    key={e.id}
                    className={cx(
                      'group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50/70',
                      editingEntry?.id === e.id && 'bg-brand-50/60',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">{e.projectName}</p>
                        <span className="shrink-0 text-xs text-slate-400">{e.projectCode}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={workTypeTone(e.workType)}>{workTypeLabel(e.workType)}</Badge>
                        {e.description && <p className="truncate text-xs text-slate-500">{e.description}</p>}
                      </div>
                    </div>
                    <span className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                      {formatHours(e.minutes)} h
                    </span>
                    <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton label="Editar" onClick={() => startEdit(e)}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton label="Eliminar" tone="danger" onClick={() => setToDelete(e)}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Eliminar imputación"
        confirmLabel="Eliminar"
        loading={deleting}
        message={
          toDelete && (
            <>
              ¿Eliminar <b>{formatHours(toDelete.minutes)} h</b> de <b>{toDelete.projectName}</b>? Esta acción no se puede
              deshacer.
            </>
          )
        }
        onCancel={() => setToDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}
