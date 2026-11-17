/**
 * Lógica de negocio y acceso a datos. Todas las reglas se validan aquí (fuente de verdad),
 * independientemente de lo que haya validado la interfaz.
 */
import type { Store } from './db';
import {
  DEFAULT_SETTINGS,
  ValidationError,
  checkDailyLimit,
  isValidIsoDate,
  isWorkType,
  percentOf,
  validateDescription,
  validateEntryMinutes,
  validateProjectCode,
  validateProjectName,
  validateSettingsPatch,
  validateUserName,
} from '../shared/rules';
import type {
  DayData,
  DaySummary,
  EntryInput,
  HistoryFilter,
  HistoryResult,
  Project,
  ProjectInput,
  Settings,
  TimeEntry,
  User,
} from '../shared/types';

/** Ventana en la que un registro idéntico se considera un doble clic accidental. */
export const DUPLICATE_WINDOW_MS = 60_000;

type Row = Record<string, unknown>;

export class Repo {
  constructor(
    private store: Store,
    private now: () => Date = () => new Date(),
  ) {}

  private ts(): string {
    return this.now().toISOString();
  }

  // -------------------------------------------------------------------------
  // Usuarios
  // -------------------------------------------------------------------------

  listUsers(): User[] {
    return this.store.all<Row>('SELECT * FROM users ORDER BY name COLLATE NOCASE').map(mapUser);
  }

  getUser(id: number): User | undefined {
    const r = this.store.get<Row>('SELECT * FROM users WHERE id = ?', [id]);
    return r ? mapUser(r) : undefined;
  }

  createUser(nameRaw: unknown): User {
    const name = validateUserName(nameRaw);
    return this.store.transaction(() => {
      if (this.store.get('SELECT id FROM users WHERE name = ? COLLATE NOCASE', [name])) {
        throw new ValidationError(`Ya existe un usuario llamado "${name}".`);
      }
      const t = this.ts();
      this.store.run('INSERT INTO users (name, created_at, updated_at) VALUES (?, ?, ?)', [name, t, t]);
      return this.getUser(this.store.lastInsertId())!;
    });
  }

  renameUser(id: number, nameRaw: unknown): User {
    const name = validateUserName(nameRaw);
    return this.store.transaction(() => {
      if (!this.getUser(id)) throw new ValidationError('El usuario no existe.');
      if (this.store.get('SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id <> ?', [name, id])) {
        throw new ValidationError(`Ya existe un usuario llamado "${name}".`);
      }
      this.store.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [name, this.ts(), id]);
      return this.getUser(id)!;
    });
  }

  // -------------------------------------------------------------------------
  // Proyectos
  // -------------------------------------------------------------------------

  listProjects(opts: { includeInactive?: boolean; search?: string } = {}): Project[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (!opts.includeInactive) where.push('p.active = 1');
    const search = (opts.search ?? '').trim();
    if (search) {
      where.push("(p.name LIKE ? ESCAPE '\\' OR p.code LIKE ? ESCAPE '\\')");
      const like = `%${escapeLike(search)}%`;
      params.push(like, like);
    }
    const sql = `
      SELECT p.*, (SELECT COUNT(*) FROM time_entries e WHERE e.project_id = p.id) AS entry_count
      FROM projects p
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.active DESC, p.name COLLATE NOCASE`;
    return this.store.all<Row>(sql, params).map(mapProject);
  }

  getProject(id: number): Project | undefined {
    const r = this.store.get<Row>(
      `SELECT p.*, (SELECT COUNT(*) FROM time_entries e WHERE e.project_id = p.id) AS entry_count
       FROM projects p WHERE p.id = ?`,
      [id],
    );
    return r ? mapProject(r) : undefined;
  }

  createProject(input: ProjectInput): Project {
    const code = validateProjectCode(input?.code);
    const name = validateProjectName(input?.name);
    const active = input.active === undefined ? true : !!input.active;
    return this.store.transaction(() => {
      this.assertCodeFree(code, null);
      const t = this.ts();
      this.store.run('INSERT INTO projects (code, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
        code,
        name,
        active ? 1 : 0,
        t,
        t,
      ]);
      return this.getProject(this.store.lastInsertId())!;
    });
  }

  updateProject(id: number, input: ProjectInput): Project {
    const code = validateProjectCode(input?.code);
    const name = validateProjectName(input?.name);
    return this.store.transaction(() => {
      const current = this.getProject(id);
      if (!current) throw new ValidationError('El proyecto no existe.');
      this.assertCodeFree(code, id);
      const active = input.active === undefined ? current.active : !!input.active;
      this.store.run('UPDATE projects SET code = ?, name = ?, active = ?, updated_at = ? WHERE id = ?', [
        code,
        name,
        active ? 1 : 0,
        this.ts(),
        id,
      ]);
      return this.getProject(id)!;
    });
  }

  setProjectActive(id: number, active: boolean): Project {
    return this.store.transaction(() => {
      if (!this.getProject(id)) throw new ValidationError('El proyecto no existe.');
      this.store.run('UPDATE projects SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, this.ts(), id]);
      return this.getProject(id)!;
    });
  }

  /** Solo se pueden eliminar proyectos sin imputaciones. Los demás se desactivan. */
  deleteProject(id: number): void {
    this.store.transaction(() => {
      const p = this.getProject(id);
      if (!p) throw new ValidationError('El proyecto no existe.');
      if (p.entryCount > 0) {
        throw new ValidationError(
          `No se puede eliminar "${p.name}" porque tiene ${p.entryCount} imputación(es). Desactívalo en su lugar.`,
        );
      }
      this.store.run('DELETE FROM projects WHERE id = ?', [id]);
    });
  }

  private assertCodeFree(code: string, exceptId: number | null) {
    const r = this.store.get<Row>('SELECT id, name FROM projects WHERE code = ? COLLATE NOCASE AND id IS NOT ?', [
      code,
      exceptId,
    ]);
    if (r) throw new ValidationError(`El código "${code}" ya está en uso por el proyecto "${r.name}".`);
  }

  // -------------------------------------------------------------------------
  // Imputaciones
  // -------------------------------------------------------------------------

  private dayMinutes(userId: number, date: string, excludeId: number | null = null): number {
    const r = this.store.get<{ total: number }>(
      'SELECT COALESCE(SUM(minutes), 0) AS total FROM time_entries WHERE user_id = ? AND date = ? AND id IS NOT ?',
      [userId, date, excludeId],
    );
    return Number(r?.total ?? 0);
  }

  daySummary(userId: number, date: string): DaySummary {
    const maxMinutes = this.getSettings().maxDailyMinutes;
    const imputedMinutes = this.dayMinutes(userId, date);
    return {
      date,
      userId,
      maxMinutes,
      imputedMinutes,
      pendingMinutes: Math.max(0, maxMinutes - imputedMinutes),
      percent: Math.min(100, percentOf(imputedMinutes, maxMinutes)),
      complete: imputedMinutes >= maxMinutes,
    };
  }

  day(userId: number, date: string): DayData {
    if (!isValidIsoDate(date)) throw new ValidationError('La fecha no es válida.');
    const entries = this.queryEntries('WHERE e.user_id = ? AND e.date = ?', [userId, date], 'e.created_at ASC');
    return { entries, summary: this.daySummary(userId, date) };
  }

  getEntry(id: number): TimeEntry | undefined {
    return this.queryEntries('WHERE e.id = ?', [id], 'e.id')[0];
  }

  private validateEntryInput(input: EntryInput, editingId: number | null) {
    if (!input || typeof input !== 'object') throw new ValidationError('Datos de imputación no válidos.');
    if (!Number.isInteger(input.userId) || !this.getUser(input.userId)) {
      throw new ValidationError('Selecciona un usuario válido.');
    }
    if (!isValidIsoDate(input.date)) throw new ValidationError('Selecciona una fecha válida.');
    const minutes = validateEntryMinutes(input.minutes);
    if (!Number.isInteger(input.projectId)) throw new ValidationError('Selecciona un proyecto.');
    const project = this.getProject(input.projectId);
    if (!project) throw new ValidationError('El proyecto seleccionado no existe.');
    if (!isWorkType(input.workType)) {
      throw new ValidationError('Selecciona el tipo de trabajo (Incidencia, Desarrollo o Mantenimiento).');
    }
    const description = validateDescription(input.description);

    // Proyecto inactivo: no se permite en registros nuevos ni al cambiar un registro a ese proyecto.
    if (!project.active) {
      const previous = editingId !== null ? this.getEntry(editingId) : undefined;
      if (!previous || previous.projectId !== project.id) {
        throw new ValidationError(`El proyecto "${project.name}" está inactivo y no admite nuevas imputaciones.`);
      }
    }

    // Límite diario: al editar se descuenta el valor anterior del propio registro.
    const max = this.getSettings().maxDailyMinutes;
    const previous = editingId !== null ? this.getEntry(editingId) : undefined;
    // Si se edita sin cambiar de día/usuario y sin aumentar horas, se permite aunque el día ya
    // supere el máximo (p. ej. tras reducir la jornada configurada).
    const notIncreasing =
      !!previous && previous.userId === input.userId && previous.date === input.date && minutes <= previous.minutes;
    if (!notIncreasing) checkDailyLimit(this.dayMinutes(input.userId, input.date, editingId), minutes, max);

    return { minutes, description };
  }

  createEntry(input: EntryInput): TimeEntry {
    return this.store.transaction(() => {
      const { minutes, description } = this.validateEntryInput(input, null);
      const nowDate = this.now();
      const since = new Date(nowDate.getTime() - DUPLICATE_WINDOW_MS).toISOString();
      const dup = this.store.get(
        `SELECT id FROM time_entries
         WHERE user_id = ? AND project_id = ? AND date = ? AND minutes = ? AND work_type = ?
           AND description = ? AND created_at >= ?`,
        [input.userId, input.projectId, input.date, minutes, input.workType, description, since],
      );
      if (dup) {
        throw new ValidationError(
          'Acabas de guardar una imputación idéntica. Se ha evitado un registro duplicado accidental.',
        );
      }
      const t = nowDate.toISOString();
      this.store.run(
        `INSERT INTO time_entries (user_id, project_id, date, minutes, work_type, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.userId, input.projectId, input.date, minutes, input.workType, description, t, t],
      );
      return this.getEntry(this.store.lastInsertId())!;
    });
  }

  updateEntry(id: number, input: EntryInput): TimeEntry {
    return this.store.transaction(() => {
      if (!this.getEntry(id)) throw new ValidationError('La imputación ya no existe.');
      const { minutes, description } = this.validateEntryInput(input, id);
      this.store.run(
        `UPDATE time_entries SET user_id = ?, project_id = ?, date = ?, minutes = ?, work_type = ?,
                description = ?, updated_at = ? WHERE id = ?`,
        [input.userId, input.projectId, input.date, minutes, input.workType, description, this.ts(), id],
      );
      return this.getEntry(id)!;
    });
  }

  deleteEntry(id: number): void {
    this.store.transaction(() => {
      if (!this.getEntry(id)) throw new ValidationError('La imputación ya no existe.');
      this.store.run('DELETE FROM time_entries WHERE id = ?', [id]);
    });
  }

  history(filter: HistoryFilter = {}): HistoryResult {
    const where: string[] = [];
    const params: (string | number)[] = [];
    const search = (filter.search ?? '').trim();
    if (search) {
      where.push("(p.name LIKE ? ESCAPE '\\' OR p.code LIKE ? ESCAPE '\\')");
      const like = `%${escapeLike(search)}%`;
      params.push(like, like);
    }
    if (filter.userId) {
      where.push('e.user_id = ?');
      params.push(filter.userId);
    }
    if (filter.projectId) {
      where.push('e.project_id = ?');
      params.push(filter.projectId);
    }
    if (filter.workType) {
      if (!isWorkType(filter.workType)) throw new ValidationError('Tipo de trabajo no válido.');
      where.push('e.work_type = ?');
      params.push(filter.workType);
    }
    if (filter.dateFrom) {
      if (!isValidIsoDate(filter.dateFrom)) throw new ValidationError('La fecha "desde" no es válida.');
      where.push('e.date >= ?');
      params.push(filter.dateFrom);
    }
    if (filter.dateTo) {
      if (!isValidIsoDate(filter.dateTo)) throw new ValidationError('La fecha "hasta" no es válida.');
      where.push('e.date <= ?');
      params.push(filter.dateTo);
    }
    const dir = filter.sortDir === 'asc' ? 'ASC' : 'DESC';
    const sortMap: Record<string, string> = {
      date: `e.date ${dir}, e.created_at ${dir}`,
      project: `p.name COLLATE NOCASE ${dir}, e.date DESC`,
      user: `u.name COLLATE NOCASE ${dir}, e.date DESC`,
      hours: `e.minutes ${dir}, e.date DESC`,
    };
    const order = sortMap[filter.sortBy ?? 'date'] ?? sortMap.date;
    const rows = this.queryEntries(where.length ? 'WHERE ' + where.join(' AND ') : '', params, order);
    const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
    return { rows, totalMinutes };
  }

  private queryEntries(where: string, params: (string | number | null)[], order: string): TimeEntry[] {
    return this.store
      .all<Row>(
        `SELECT e.*, u.name AS user_name, p.code AS project_code, p.name AS project_name, p.active AS project_active
         FROM time_entries e
         JOIN users u ON u.id = e.user_id
         JOIN projects p ON p.id = e.project_id
         ${where}
         ORDER BY ${order}`,
        params,
      )
      .map(mapEntry);
  }

  // -------------------------------------------------------------------------
  // Configuración (tabla clave/valor con valores JSON)
  // -------------------------------------------------------------------------

  getSettings(): Settings {
    const rows = this.store.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    const s: Settings = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (r.key in DEFAULT_SETTINGS) {
        try {
          (s as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
        } catch {
          /* valor corrupto: se usa el predeterminado */
        }
      }
    }
    return s;
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const clean = validateSettingsPatch((patch ?? {}) as Record<string, unknown>);
    if (clean.currentUserId != null && !this.getUser(clean.currentUserId)) {
      throw new ValidationError('El usuario seleccionado no existe.');
    }
    this.store.transaction(() => {
      const t = this.ts();
      for (const [key, value] of Object.entries(clean)) {
        this.store.run(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, JSON.stringify(value), t],
        );
      }
    });
    return this.getSettings();
  }

  /** Restaura los valores predeterminados manteniendo el usuario actual. */
  resetSettings(): Settings {
    const keep = this.getSettings().currentUserId;
    this.store.transaction(() => {
      this.store.run('DELETE FROM settings');
    });
    return this.updateSettings({ currentUserId: keep });
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

function mapUser(r: Row): User {
  return {
    id: Number(r.id),
    name: String(r.name),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapProject(r: Row): Project {
  return {
    id: Number(r.id),
    code: String(r.code),
    name: String(r.name),
    active: Number(r.active) === 1,
    entryCount: Number(r.entry_count ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapEntry(r: Row): TimeEntry {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    userName: String(r.user_name),
    projectId: Number(r.project_id),
    projectCode: String(r.project_code),
    projectName: String(r.project_name),
    projectActive: Number(r.project_active) === 1,
    date: String(r.date),
    minutes: Number(r.minutes),
    workType: r.work_type as TimeEntry['workType'],
    description: String(r.description ?? ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
