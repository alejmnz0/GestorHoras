/**
 * Estructura principal: menú lateral, navegación entre secciones, primer uso y avisos.
 */
import { CalendarClock, FolderKanban, History, Settings as SettingsIcon, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Settings, User } from '../shared/types';
import { useToast } from './components/Toast';
import { Button, Field, Modal, cx, inputClass } from './components/ui';
import { api, errorMessage } from './lib/api';
import { AppContext, type AppState } from './lib/appContext';
import { playChime } from './lib/sound';
import { ConfiguracionPage } from './pages/Configuracion';
import { HistoricoPage } from './pages/Historico';
import { ImputarPage } from './pages/Imputar';
import { ProyectosPage } from './pages/Proyectos';

type Page = 'imputar' | 'historico' | 'proyectos' | 'configuracion';

const NAV: { id: Page; label: string; icon: typeof History }[] = [
  { id: 'imputar', label: 'Imputar horas', icon: CalendarClock },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'proyectos', label: 'Proyectos', icon: FolderKanban },
  { id: 'configuracion', label: 'Configuración', icon: SettingsIcon },
];

export function App() {
  const toast = useToast();
  const [page, setPage] = useState<Page>('imputar');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [userDialog, setUserDialog] = useState<'first' | 'new' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadUsers = useCallback(async () => {
    const list = await api.users.list();
    setUsers(list);
    return list;
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.settings.get(), api.users.list()]);
      setUsers(list);
      if (list.length === 0) {
        setSettings(s);
        setUserDialog('first');
      } else if (!s.currentUserId || !list.some((u) => u.id === s.currentUserId)) {
        setSettings(await api.settings.update({ currentUserId: list[0].id }));
      } else {
        setSettings(s);
      }
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadAll();
    const offs = [
      api.on.settingsChanged((s) => setSettings(s)),
      api.on.dataChanged(() => {
        setDataVersion((v) => v + 1);
        void reloadUsers().then((list) => {
          if (list.length === 0) setUserDialog('first');
        });
      }),
      api.on.reminder((a) => {
        if (a.sound) playChime(a.volume);
        toast.show('reminder', 'Es hora de imputar tus horas', 'Registra el tiempo dedicado a tus proyectos.', 8000);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Tras importar una copia de seguridad el usuario actual puede no existir.
  useEffect(() => {
    if (settings && users.length && settings.currentUserId && !users.some((u) => u.id === settings.currentUserId)) {
      void api.settings.update({ currentUserId: users[0].id }).then(setSettings);
    }
  }, [settings, users]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const s = await api.settings.update(patch);
    setSettings(s);
    return s;
  }, []);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <div>
          <p className="font-semibold text-red-600">No se pudieron cargar los datos</p>
          <p className="mt-1 text-sm text-slate-500">{loadError}</p>
          <Button className="mt-4" onClick={() => location.reload()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  const state: AppState = { settings, users, dataVersion, updateSettings, reloadUsers };
  const currentUser = users.find((u) => u.id === settings.currentUserId);

  return (
    <AppContext.Provider value={state}>
      <div className="flex h-full">
        <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200/80 bg-white">
          <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
            <img src="./icon.png" alt="" className="size-8 rounded-lg" />
            <div>
              <p className="text-sm leading-tight font-semibold text-slate-900">Gestor de Horas</p>
              <p className="text-xs text-slate-400">Imputación de tiempo</p>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 px-3">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                aria-current={page === id ? 'page' : undefined}
                className={cx(
                  'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors',
                  page === id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <Icon className={cx('size-[18px]', page === id ? 'text-brand-600' : 'text-slate-400')} />
                {label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setPage('configuracion')}
            className="m-3 flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:bg-slate-50"
            title="Cambiar usuario en Configuración"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {currentUser ? currentUser.name.charAt(0).toUpperCase() : <UserRound className="size-4" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-800">{currentUser?.name ?? 'Sin usuario'}</p>
              <p className="text-xs text-slate-400">Usuario actual</p>
            </div>
          </button>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className={cx('mx-auto h-full px-8 py-7', page === 'historico' ? 'max-w-none' : 'max-w-[1200px]')}>
            {page === 'imputar' && <ImputarPage onAddUser={() => setUserDialog('new')} />}
            {page === 'historico' && <HistoricoPage />}
            {page === 'proyectos' && <ProyectosPage />}
            {page === 'configuracion' && <ConfiguracionPage onAddUser={() => setUserDialog('new')} />}
          </div>
        </main>
      </div>

      <UserDialog
        mode={userDialog}
        onClose={() => setUserDialog(null)}
        onCreated={async (u) => {
          await reloadUsers();
          await updateSettings({ currentUserId: u.id });
          setUserDialog(null);
          toast.success(`¡Hola, ${u.name}!`, 'Usuario seleccionado.');
        }}
      />
    </AppContext.Provider>
  );
}

function UserDialog({
  mode,
  onClose,
  onCreated,
}: {
  mode: 'first' | 'new' | null;
  onClose: () => void;
  onCreated: (u: User) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName('');
    setError(null);
  }, [mode]);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCreated(await api.users.create(name));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const first = mode === 'first';
  return (
    <Modal
      open={!!mode}
      title={first ? 'Bienvenido a Gestor de Horas' : 'Nuevo usuario'}
      onClose={first ? () => undefined : onClose}
      width="max-w-md"
      footer={
        <>
          {!first && <Button onClick={onClose}>Cancelar</Button>}
          <Button variant="primary" loading={saving} onClick={() => save()}>
            {first ? 'Empezar' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {first && (
          <p className="text-sm text-slate-600">
            Para empezar, indica tu nombre. Se recordará automáticamente y podrás cambiarlo cuando quieras en Configuración.
          </p>
        )}
        <Field label="Tu nombre" required error={error}>
          <input
            autoFocus
            className={inputClass}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre y apellidos"
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
