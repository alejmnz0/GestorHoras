import { AlertCircle, AlarmClock, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './ui';

type Tone = 'success' | 'error' | 'warning' | 'info' | 'reminder';
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  message?: string;
}

interface ToastApi {
  show: (tone: Tone, title: string, message?: string, ms?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('ToastProvider ausente');
  return c;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (tone: Tone, title: string, message?: string, ms = tone === 'error' ? 6000 : 3500) => {
      const id = nextId++;
      setItems((l) => [...l.slice(-2), { id, tone, title, message }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const api: ToastApi = {
    show,
    success: useCallback((t: string, m?: string) => show('success', t, m), [show]),
    error: useCallback((t: string, m?: string) => show('error', t, m), [show]),
  };
  const icons = {
    success: <CheckCircle2 className="size-[18px] text-emerald-600" />,
    error: <AlertCircle className="size-[18px] text-red-600" />,
    warning: <AlertCircle className="size-[18px] text-orange-500" />,
    info: <Info className="size-[18px] text-brand-600" />,
    reminder: <AlarmClock className="size-[18px] text-orange-500" />,
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-[360px] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pop-in pointer-events-auto flex gap-3 rounded-xl border bg-white p-3.5 shadow-lg shadow-slate-900/10',
              t.tone === 'error' ? 'border-red-200' : t.tone === 'reminder' ? 'border-orange-200' : 'border-slate-200',
            )}
          >
            <div className="pt-px">{icons[t.tone]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{t.title}</p>
              {t.message && <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{t.message}</p>}
            </div>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
