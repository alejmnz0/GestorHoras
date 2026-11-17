/**
 * Componentes básicos de interfaz (botones, tarjetas, modales, interruptores…).
 */
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ComponentProps<'button'> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}) {
  const variants: Record<Variant, string> = {
    primary: 'bg-brand-600 text-on-accent hover:bg-[color-mix(in_oklab,var(--color-brand-600)_86%,black)] shadow-sm shadow-brand-600/20 disabled:bg-brand-600/50',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
    danger: 'bg-[#dc2626] text-on-accent hover:bg-[#b91c1c] shadow-sm',
  };
  const sizes = { sm: 'h-8 px-2.5 text-[13px] gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-11 px-5 text-[15px] gap-2' };
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  tone = 'default',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'danger' ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-slate-900',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  group,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** true cuando el contenido es un grupo de botones (no se envuelve en <label>). */
  group?: boolean;
}) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={cx('block', className)} {...(group ? { role: 'group', 'aria-label': label } : {})}>
      <span className="mb-1.5 flex items-center justify-between text-[13px] font-medium text-slate-700">
        <span>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {hint && <span className="font-normal text-slate-400">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </Tag>
  );
}

export const inputClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition ' +
  'placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 ' +
  'disabled:bg-slate-50 disabled:text-slate-500';

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-50',
        checked ? 'bg-brand-600' : 'bg-slate-300',
      )}
    >
      <span
        className={cx(
          'inline-block size-4 rounded-full bg-on-accent shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function Badge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: 'slate' | 'blue' | 'green' | 'orange' | 'red' | 'violet';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <span className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px] fade-in">
      <div className={cx('pop-in w-full rounded-2xl bg-white shadow-2xl shadow-black/25', width)} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <IconButton label="Cerrar" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 30);
  }, [open]);
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button ref={ref} variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="size-[18px]" />
          </div>
        )}
        <div className="pt-1 text-sm leading-relaxed text-slate-600">{message}</div>
      </div>
    </Modal>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">{icon}</div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[13px] text-slate-500">{children}</div>}
    </div>
  );
}

export function workTypeTone(t: string): 'red' | 'blue' | 'violet' | 'green' {
  return t === 'incidencia' ? 'red' : t === 'desarrollo' ? 'blue' : t === 'ausencia' ? 'green' : 'violet';
}
