/** Bloques de maquetación de la pantalla de Configuración. */
import type { ReactNode } from 'react';
import { Card } from './ui';

export function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {icon && <span className="text-slate-400">{icon}</span>}
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </Card>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-6 px-5 py-2.5">
      <div>
        <p className="text-[13px] font-medium text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
