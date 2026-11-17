/**
 * Gestión de proyectos: alta, edición, activación/desactivación, búsqueda y borrado
 * (solo de proyectos sin imputaciones).
 */
import { FolderKanban, Pencil, Plus, Power, PowerOff, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PROJECT_CODE_MAX_LENGTH, PROJECT_KINDS, PROJECT_NAME_MAX_LENGTH } from '../../shared/rules';
import type { AbsenceKind, Project, ProjectKind } from '../../shared/types';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Toggle,
  cx,
  inputClass,
} from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/appContext';

type StatusFilter = 'all' | 'active' | 'inactive';

export function ProyectosPage() {
  const { dataVersion } = useApp();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<Project | { newKind: ProjectKind } | null>(null);
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.projects
        .list({ includeInactive: true, search })
        .then(setProjects)
        .catch((e) => toast.error('Error al cargar proyectos', errorMessage(e)));
    }, 150);
    return () => clearTimeout(t);
  }, [search, dataVersion]);

  const shown = projects.filter((p) => (status === 'all' ? true : status === 'active' ? p.active : !p.active));
  const counts = { all: projects.length, active: projects.filter((p) => p.active).length };

  async function toggleActive(p: Project) {
    try {
      await api.projects.setActive(p.id, !p.active);
      toast.success(p.active ? 'Proyecto desactivado' : 'Proyecto activado', p.name);
    } catch (e) {
      toast.error('No se pudo cambiar el estado', errorMessage(e));
    }
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.projects.remove(toDelete.id);
      toast.success('Proyecto eliminado', toDelete.name);
      setToDelete(null);
    } catch (e) {
      toast.error('No se pudo eliminar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Proyectos"
        subtitle="Solo los proyectos activos aparecen al imputar horas."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ newKind: 'normal' })}>
            Nuevo proyecto
          </Button>
        }
      />

      <SpecialProjects
        projects={projects}
        onConfigure={(kind) => setEditing({ newKind: kind })}
        onEdit={(p) => setEditing(p)}
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cx(inputClass, 'pl-8')}
            placeholder="Buscar por código o nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-[13px]">
          {(
            [
              ['all', `Todos (${counts.all})`],
              ['active', `Activos (${counts.active})`],
              ['inactive', `Inactivos (${counts.all - counts.active})`],
            ] as [StatusFilter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className={cx(
                'h-8 rounded-md px-3 font-medium transition',
                status === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="w-[180px] border-b border-slate-200 px-4 py-2.5">Código</th>
              <th className="border-b border-slate-200 px-4 py-2.5">Nombre</th>
              <th className="w-[120px] border-b border-slate-200 px-4 py-2.5">Estado</th>
              <th className="w-[120px] border-b border-slate-200 px-4 py-2.5 text-right">Imputaciones</th>
              <th className="w-[130px] border-b border-slate-200 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.code}</td>
                <td className={cx('px-4 py-2.5 font-medium', p.active ? 'text-slate-800' : 'text-slate-400')}>
                  {p.name}
                  {p.kind !== 'normal' && (
                    <Badge tone="green" className="ml-2">
                      {PROJECT_KINDS.find((k) => k.value === p.kind)?.emoji} {PROJECT_KINDS.find((k) => k.value === p.kind)?.label}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={p.active ? 'green' : 'slate'}>{p.active ? 'Activo' : 'Inactivo'}</Badge>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{p.entryCount}</td>
                <td className="px-4 py-1.5">
                  <div className="flex justify-end gap-0.5">
                    <IconButton label="Editar" onClick={() => setEditing(p)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton label={p.active ? 'Desactivar' : 'Activar'} onClick={() => toggleActive(p)}>
                      {p.active ? <PowerOff className="size-3.5" /> : <Power className="size-3.5 text-emerald-600" />}
                    </IconButton>
                    <IconButton
                      label={
                        p.entryCount > 0 ? 'No se puede eliminar: tiene imputaciones. Desactívalo en su lugar.' : 'Eliminar'
                      }
                      tone="danger"
                      disabled={p.entryCount > 0}
                      onClick={() => setToDelete(p)}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <EmptyState icon={<FolderKanban className="size-5" />} title={search ? 'Sin resultados' : 'Aún no hay proyectos'}>
            {search ? 'Ningún proyecto coincide con la búsqueda.' : 'Crea tu primer proyecto para empezar a imputar horas.'}
          </EmptyState>
        )}
      </Card>

      <ProjectModal project={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Eliminar proyecto"
        confirmLabel="Eliminar"
        loading={busy}
        message={
          toDelete && (
            <>
              ¿Eliminar definitivamente el proyecto <b>{toDelete.name}</b> ({toDelete.code})?
            </>
          )
        }
        onCancel={() => setToDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}

/** Tarjeta con los proyectos especiales (vacaciones y baja) y acceso rápido para configurarlos. */
function SpecialProjects({
  projects,
  onConfigure,
  onEdit,
}: {
  projects: Project[];
  onConfigure: (kind: AbsenceKind) => void;
  onEdit: (p: Project) => void;
}) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3">
      {PROJECT_KINDS.filter((k) => k.value !== 'normal').map((k) => {
        const p = projects.find((x) => x.kind === k.value);
        return (
          <Card key={k.value} className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-xl">{k.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-800">Proyecto especial de {k.label}</p>
              <p className="truncate text-xs text-slate-500">
                {p
                  ? `${p.name} (${p.code}) · ${p.entryCount} imputación(es)${p.active ? '' : ' · inactivo'}`
                  : k.value === 'vacation'
                    ? 'Sin configurar: necesario para registrar vacaciones.'
                    : 'Sin configurar: necesario para registrar bajas laborales.'}
              </p>
            </div>
            {p ? (
              <Button size="sm" onClick={() => onEdit(p)}>
                Editar
              </Button>
            ) : (
              <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => onConfigure(k.value as AbsenceKind)}>
                Configurar
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ProjectModal({
  project,
  onClose,
}: {
  project: Project | { newKind: ProjectKind } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [kind, setKind] = useState<ProjectKind>('normal');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = !!project && 'newKind' in project;
  const locked = !!project && !isNew && (project as Project).entryCount > 0;

  useEffect(() => {
    if (!project) return;
    setError(null);
    if ('newKind' in project) {
      const k = project.newKind;
      setKind(k);
      setCode(k === 'vacation' ? 'VACACIONES' : k === 'sick_leave' ? 'BAJA' : '');
      setName(k === 'vacation' ? 'Vacaciones' : k === 'sick_leave' ? 'Baja laboral' : '');
      setActive(true);
    } else {
      setCode(project.code);
      setName(project.name);
      setActive(project.active);
      setKind(project.kind);
    }
  }, [project]);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) await api.projects.create({ code, name, active, kind });
      else if (project && 'id' in project) await api.projects.update(project.id, { code, name, active, kind });
      toast.success(isNew ? 'Proyecto creado' : 'Proyecto actualizado', name.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!project}
      title={isNew ? 'Nuevo proyecto' : 'Editar proyecto'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={() => save()}>
            {isNew ? 'Crear proyecto' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        <Field label="Código" required hint={`${code.length}/${PROJECT_CODE_MAX_LENGTH}`}>
          <input
            autoFocus
            className={cx(inputClass, 'font-mono')}
            maxLength={PROJECT_CODE_MAX_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="p. ej. PRJ-2026-014"
          />
        </Field>
        <Field label="Nombre" required hint="Es lo que verás al imputar">
          <input
            className={inputClass}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Portal de clientes"
          />
        </Field>
        <Field label="Tipo de proyecto" group hint={locked ? 'No se puede cambiar: ya tiene imputaciones' : undefined}>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {PROJECT_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                disabled={locked}
                aria-pressed={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cx(
                  'h-8 rounded-lg text-[13px] font-medium transition disabled:cursor-not-allowed',
                  kind === k.value ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {k.emoji} {k.label}
              </button>
            ))}
          </div>
          {kind !== 'normal' && (
            <p className="mt-1.5 text-xs text-slate-500">
              Las imputaciones a este proyecto cuentan como ausencia y completan la jornada. Solo puede haber uno.
            </p>
          )}
        </Field>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
          <div>
            <p className="text-[13px] font-medium text-slate-700">Proyecto activo</p>
            <p className="text-xs text-slate-500">Los inactivos no aparecen al imputar, pero se conservan en el histórico.</p>
          </div>
          <Toggle checked={active} onChange={setActive} label="Proyecto activo" />
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700" role="alert">
            {error}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
