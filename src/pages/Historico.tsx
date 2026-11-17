/**
 * Histórico de imputaciones en formato tabla (estilo hoja de cálculo) con filtros,
 * ordenación, totales, paginación, edición, borrado y exportación a Excel/CSV.
 */
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  FilterX,
  Pencil,
  Search,
  Table2,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { WORK_TYPES, formatDate, formatHours, workTypeLabel } from '../../shared/rules';
import type { HistoryFilter, HistoryResult, Project, SortField, TimeEntry, WorkType } from '../../shared/types';
import { EditEntryModal } from '../components/EditEntryModal';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, PageHeader, cx, inputClass, workTypeTone } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/appContext';

const PAGE_SIZE = 50;
const EMPTY_FILTER: HistoryFilter = {
  search: '',
  userId: null,
  projectId: null,
  workType: null,
  dateFrom: null,
  dateTo: null,
  sortBy: 'date',
  sortDir: 'desc',
};

export function HistoricoPage() {
  const { users, dataVersion } = useApp();
  const toast = useToast();
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<HistoryResult>({ rows: [], totalMinutes: 0 });
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [toDelete, setToDelete] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);

  // Búsqueda con pequeño retardo para no consultar en cada pulsación.
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => ({ ...f, search })), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.entries
      .history(filter)
      .then((r) => alive && setResult(r))
      .catch((e) => toast.error('Error al cargar el histórico', errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filter, dataVersion]);

  useEffect(() => setPage(0), [filter]);
  useEffect(() => {
    api.projects.list({ includeInactive: true }).then(setProjects).catch(() => {});
  }, [dataVersion]);

  const pages = Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = useMemo(
    () => result.rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [result.rows, safePage],
  );

  const set = (patch: Partial<HistoryFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const sortBy = (field: SortField) =>
    setFilter((f) => ({
      ...f,
      sortBy: field,
      sortDir: f.sortBy === field ? (f.sortDir === 'asc' ? 'desc' : 'asc') : field === 'date' || field === 'hours' ? 'desc' : 'asc',
    }));

  const hasFilters =
    !!search || !!filter.userId || !!filter.projectId || !!filter.workType || !!filter.dateFrom || !!filter.dateTo;

  async function doExport(format: 'xlsx' | 'csv') {
    setExporting(format);
    try {
      const file = await api.entries.exportHistory(filter, format);
      if (file) toast.success('Exportación completada', file);
    } catch (e) {
      toast.error('No se pudo exportar', errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.entries.remove(toDelete.id);
      toast.success('Imputación eliminada');
      setToDelete(null);
    } catch (e) {
      toast.error('No se pudo eliminar', errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fade-in flex h-full flex-col">
      <PageHeader
        title="Histórico"
        subtitle="Consulta, edita y exporta todas las imputaciones."
        actions={
          <>
            <Button
              icon={<FileText className="size-4" />}
              loading={exporting === 'csv'}
              disabled={!result.rows.length}
              onClick={() => doExport('csv')}
            >
              CSV
            </Button>
            <Button
              variant="primary"
              icon={<FileSpreadsheet className="size-4" />}
              loading={exporting === 'xlsx'}
              disabled={!result.rows.length}
              onClick={() => doExport('xlsx')}
            >
              Exportar a Excel
            </Button>
          </>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-56 grow">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className={cx(inputClass, 'pl-8')}
              placeholder="Buscar proyecto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={cx(inputClass, 'w-44!')}
            value={filter.userId ?? ''}
            onChange={(e) => set({ userId: Number(e.target.value) || null })}
            aria-label="Filtrar por usuario"
          >
            <option value="">Todos los usuarios</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            className={cx(inputClass, 'w-48!')}
            value={filter.projectId ?? ''}
            onChange={(e) => set({ projectId: Number(e.target.value) || null })}
            aria-label="Filtrar por proyecto"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {!p.active ? ' (inactivo)' : ''}
              </option>
            ))}
          </select>
          <select
            className={cx(inputClass, 'w-40!')}
            value={filter.workType ?? ''}
            onChange={(e) => set({ workType: (e.target.value || null) as WorkType | null })}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos los tipos</option>
            {WORK_TYPES.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <input
              type="date"
              className={cx(inputClass, 'w-36! px-2')}
              value={filter.dateFrom ?? ''}
              onChange={(e) => set({ dateFrom: e.target.value || null })}
              aria-label="Desde"
              title="Desde"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              className={cx(inputClass, 'w-36! px-2')}
              value={filter.dateTo ?? ''}
              onChange={(e) => set({ dateTo: e.target.value || null })}
              aria-label="Hasta"
              title="Hasta"
            />
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between px-1">
          <div className="flex items-center gap-4 text-[13px] text-slate-500">
            <span>
              <b className="font-semibold text-slate-800">{result.rows.length}</b> registro(s)
            </span>
            <span>
              Total: <b className="font-semibold tabular-nums text-brand-700">{formatHours(result.totalMinutes)} h</b>
            </span>
          </div>
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              icon={<FilterX className="size-3.5" />}
              onClick={() => {
                setSearch('');
                setFilter(EMPTY_FILTER);
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-xs font-semibold text-slate-500">
                <Th field="date" filter={filter} onSort={sortBy} className="w-[104px]">
                  Fecha
                </Th>
                <Th field="user" filter={filter} onSort={sortBy} className="w-[140px]">
                  Usuario
                </Th>
                <Th field="project" filter={filter} onSort={sortBy}>
                  Proyecto
                </Th>
                <Th className="w-[120px]">Código proyecto</Th>
                <Th className="w-[120px]">Tipo</Th>
                <Th field="hours" filter={filter} onSort={sortBy} className="w-[76px] text-right">
                  Horas
                </Th>
                <Th>Descripción</Th>
                <Th className="w-[76px]" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr
                  key={r.id}
                  className={cx('group border-b border-slate-100 hover:bg-brand-50/40', i % 2 === 1 && 'bg-slate-50/40')}
                >
                  <Td className="tabular-nums text-slate-700">{formatDate(r.date)}</Td>
                  <Td className="text-slate-700">{r.userName}</Td>
                  <Td className="font-medium text-slate-800">
                    {r.projectName}
                    {!r.projectActive && <Badge className="ml-1.5">inactivo</Badge>}
                  </Td>
                  <Td className="font-mono text-xs text-slate-500">{r.projectCode}</Td>
                  <Td>
                    <Badge tone={workTypeTone(r.workType)}>{workTypeLabel(r.workType)}</Badge>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums text-slate-900">{formatHours(r.minutes)}</Td>
                  <Td className="max-w-0 truncate text-slate-500" title={r.description}>
                    {r.description}
                  </Td>
                  <Td>
                    <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton label="Editar" onClick={() => setEditing(r)}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton label="Eliminar" tone="danger" onClick={() => setToDelete(r)}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && result.rows.length === 0 && (
            <EmptyState icon={<Table2 className="size-5" />} title="No hay imputaciones">
              {hasFilters ? 'Prueba a cambiar o limpiar los filtros.' : 'Cuando registres horas aparecerán aquí.'}
            </EmptyState>
          )}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[13px] text-slate-500">
            <span>
              {safePage * PAGE_SIZE + 1}–{Math.min(result.rows.length, (safePage + 1) * PAGE_SIZE)} de {result.rows.length}
            </span>
            <div className="flex items-center gap-1">
              <IconButton label="Página anterior" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <span className="px-2 tabular-nums">
                {safePage + 1} / {pages}
              </span>
              <IconButton label="Página siguiente" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
          </div>
        )}
      </Card>

      <EditEntryModal entry={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Eliminar imputación"
        confirmLabel="Eliminar"
        loading={deleting}
        message={
          toDelete && (
            <>
              ¿Eliminar la imputación del <b>{formatDate(toDelete.date)}</b> en <b>{toDelete.projectName}</b> (
              {formatHours(toDelete.minutes)} h)? Esta acción no se puede deshacer.
            </>
          )
        }
        onCancel={() => setToDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}

function Th({
  children,
  field,
  filter,
  onSort,
  className,
}: {
  children?: React.ReactNode;
  field?: SortField;
  filter?: HistoryFilter;
  onSort?: (f: SortField) => void;
  className?: string;
}) {
  const active = field && filter?.sortBy === field;
  const Icon = !active ? ArrowUpDown : filter?.sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={cx('border-b border-slate-200 px-3 py-2.5 font-semibold whitespace-nowrap', className)}>
      {field ? (
        <button
          type="button"
          onClick={() => onSort?.(field)}
          className={cx(
            'inline-flex items-center gap-1 hover:text-slate-900',
            active && 'text-slate-900',
            className?.includes('text-right') && 'flex-row-reverse',
          )}
        >
          {children}
          <Icon className={cx('size-3', !active && 'opacity-40')} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Td({ children, className, title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={cx('h-10 px-3 whitespace-nowrap', className)} title={title}>
      {children}
    </td>
  );
}
