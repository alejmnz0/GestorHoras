/**
 * Registro de vacaciones o baja en un rango de fechas (solo días laborables).
 * Cada día se completa con lo pendiente, o con las horas indicadas (medias jornadas).
 */
import { useEffect, useMemo, useState } from 'react';
import { PROJECT_KINDS, dateRange, formatDate, formatHours, isValidIsoDate, isWorkday } from '../../shared/rules';
import type { AbsenceKind, Project } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/appContext';
import { HoursPicker } from './HoursPicker';
import { useToast } from './Toast';
import { Button, Field, Modal, Toggle, cx, inputClass } from './ui';

export function AbsenceModal({
  open,
  initialDate,
  onClose,
  onGoToProjects,
}: {
  open: boolean;
  initialDate: string;
  onClose: () => void;
  onGoToProjects: () => void;
}) {
  const { settings } = useApp();
  const toast = useToast();
  const [kind, setKind] = useState<AbsenceKind>('vacation');
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);
  const [fullDay, setFullDay] = useState(true);
  const [minutes, setMinutes] = useState(240);
  const [description, setDescription] = useState('');
  const [special, setSpecial] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrom(initialDate);
    setTo(initialDate);
    setError(null);
    setDescription('');
    api.projects.list({ includeInactive: true }).then((all) => setSpecial(all.filter((p) => p.kind !== 'normal')));
  }, [open, initialDate]);

  const project = special.find((p) => p.kind === kind);
  const workingDays = useMemo(() => {
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || to < from) return 0;
    return dateRange(from, to, 367).filter((d) => isWorkday(d, settings.workDays)).length;
  }, [from, to, settings.workDays]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await api.entries.registerAbsence({
        userId: settings.currentUserId!,
        kind,
        dateFrom: from,
        dateTo: to,
        minutesPerDay: fullDay ? null : minutes,
        description,
      });
      const label = kind === 'vacation' ? 'Vacaciones registradas' : 'Baja registrada';
      const extra =
        (r.skippedFull.length ? ` · ${r.skippedFull.length} día(s) ya estaban completos` : '') +
        (r.truncated.length ? ` · en ${r.truncated.length} día(s) solo cabía una parte` : '');
      toast.success(label, `${r.dates.length} día(s) laborable(s)${extra}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Registrar ausencia"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} disabled={!project || workingDays === 0} onClick={save}>
            Registrar {workingDays > 0 ? `${workingDays} día(s)` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {PROJECT_KINDS.filter((k) => k.value !== 'normal').map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value as AbsenceKind)}
              className={cx(
                'flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition',
                kind === k.value
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <span className="text-xl">{k.emoji}</span>
              <span className="text-sm font-medium text-slate-800">{k.label}</span>
            </button>
          ))}
        </div>

        {!project ? (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-[13px] text-orange-700">
            Aún no has configurado el proyecto especial de {kind === 'vacation' ? 'Vacaciones' : 'Baja laboral'}.{' '}
            <button type="button" className="font-semibold underline" onClick={onGoToProjects}>
              Configurarlo en Proyectos
            </button>
          </div>
        ) : (
          <p className="text-[13px] text-slate-500">
            Se imputará al proyecto <b className="text-slate-700">{project.name}</b> ({project.code}).
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde" required>
            <input type="date" className={inputClass} value={from} onChange={(e) => {
              setFrom(e.target.value);
              if (e.target.value > to) setTo(e.target.value);
            }} />
          </Field>
          <Field label="Hasta" required>
            <input type="date" className={inputClass} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <p className="-mt-1 text-xs text-slate-500">
          {workingDays > 0
            ? `${workingDays} día(s) laborable(s) entre el ${formatDate(from)} y el ${formatDate(to)}. Los no laborables se omiten.`
            : 'El periodo no contiene días laborables.'}
        </p>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
          <div>
            <p className="text-[13px] font-medium text-slate-700">Jornada completa</p>
            <p className="text-xs text-slate-500">
              Completa lo que falte de cada día (hasta {formatHours(settings.maxDailyMinutes)} h).
            </p>
          </div>
          <Toggle checked={fullDay} onChange={setFullDay} label="Jornada completa" />
        </div>
        {!fullDay && (
          <Field label="Horas por día" group hint="Para medias jornadas">
            <HoursPicker value={minutes} onChange={setMinutes} max={settings.maxDailyMinutes} />
          </Field>
        )}

        <Field label="Descripción" hint="Opcional">
          <input
            className={inputClass}
            maxLength={500}
            value={description}
            placeholder={kind === 'vacation' ? 'p. ej. Vacaciones de verano' : 'p. ej. Baja médica'}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
