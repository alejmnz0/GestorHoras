/**
 * Modal para editar una imputación existente (usado desde el histórico).
 * Calcula el disponible del día descontando el valor anterior del propio registro.
 */
import { useEffect, useState } from 'react';
import type { Project, TimeEntry } from '../../shared/types';
import { api } from '../lib/api';
import { useApp } from '../lib/appContext';
import { EntryForm, type EntryFormValues } from './EntryForm';
import { useToast } from './Toast';
import { Modal } from './ui';

export function EditEntryModal({ entry, onClose }: { entry: TimeEntry | null; onClose: () => void }) {
  const { users, settings } = useApp();
  const toast = useToast();
  const [values, setValues] = useState<EntryFormValues | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [used, setUsed] = useState(0);

  useEffect(() => {
    if (!entry) return setValues(null);
    setValues({
      userId: entry.userId,
      date: entry.date,
      minutes: entry.minutes,
      projectId: entry.projectId,
      workType: entry.workType === 'ausencia' ? null : entry.workType,
      description: entry.description,
    });
    api.projects.list({ includeInactive: true }).then((all) =>
      setProjects(all.filter((p) => p.active || p.id === entry.projectId)),
    );
  }, [entry]);

  useEffect(() => {
    if (!entry || !values?.userId || !values.date) return;
    api.entries
      .day(values.userId, values.date)
      .then((d) => setUsed(d.entries.filter((e) => e.id !== entry.id).reduce((s, e) => s + e.minutes, 0)))
      .catch(() => setUsed(0));
  }, [entry, values?.userId, values?.date]);

  return (
    <Modal open={!!entry && !!values} title="Editar imputación" onClose={onClose} width="max-w-xl">
      {entry && values && (
        <EntryForm
          compact
          editing
          values={values}
          onChange={setValues}
          users={users}
          projects={projects}
          maxMinutes={settings.maxDailyMinutes}
          usedMinutes={used}
          onCancel={onClose}
          onSubmit={async (input) => {
            await api.entries.update(entry.id, input);
            toast.success('Imputación actualizada');
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
