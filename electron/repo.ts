/**
 * Lógica de negocio y acceso a datos. Todas las reglas se validan aquí (fuente de verdad),
 * independientemente de lo que haya validado la interfaz.
 */
import type { Store } from './db';
import {
  DEFAULT_SETTINGS,
  ValidationError,
  SLOT_MINUTES,
  addDays,
  checkDailyLimit,
  dateRange,
  isAbsenceKind,
  isValidIsoDate,
  isWorkKind,
  isWorkday,
  projectKindLabel,
  todayIso,
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
  AbsenceInput,
  AbsenceResult,
  ProjectKind,
  ProjectStat,
  SharedDistribution,
  StatsResult,
  WorkType,
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
    const kind = validateKind(input.kind);
    return this.store.transaction(() => {
      this.assertCodeFree(code, null);
      this.assertKindFree(kind, null);
      const t = this.ts();
      this.store.run(
        'INSERT INTO projects (code, name, active, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [code, name, active ? 1 : 0, kind, t, t],
      );
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
      const kind = input.kind === undefined ? current.kind : validateKind(input.kind);
      if (kind !== current.kind) {
        if (current.entryCount > 0) {
          throw new ValidationError(
            'No se puede cambiar el tipo de un proyecto que ya tiene imputaciones. Crea un proyecto nuevo para ese uso.',
          );
        }
        this.assertKindFree(kind, id);
      }
      this.store.run('UPDATE projects SET code = ?, name = ?, active = ?, kind = ?, updated_at = ? WHERE id = ?', [
        code,
        name,
        active ? 1 : 0,
        kind,
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

  /** Solo puede haber un proyecto de vacaciones y uno de baja. */
  private assertKindFree(kind: ProjectKind, exceptId: number | null) {
    if (kind === 'normal') return;
    const r = this.store.get<Row>('SELECT name FROM projects WHERE kind = ? AND id IS NOT ?', [kind, exceptId]);
    if (r) {
      throw new ValidationError(`Ya existe un proyecto de ${projectKindLabel(kind)}: "${r.name}". Solo puede haber uno.`);
    }
  }

  /** Proyecto especial (vacaciones / baja) si está configurado. */
  specialProject(kind: Exclude<ProjectKind, 'normal'>): Project | undefined {
    const r = this.store.get<{ id: number }>('SELECT id FROM projects WHERE kind = ?', [kind]);
    return r ? this.getProject(Number(r.id)) : undefined;
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
    const settings = this.getSettings();
    const maxMinutes = settings.maxDailyMinutes;
    const imputedMinutes = this.dayMinutes(userId, date);
    const abs = this.store.get<{ v: number; s: number }>(
      `SELECT COALESCE(SUM(CASE WHEN p.kind = 'vacation' THEN e.minutes END), 0) AS v,
              COALESCE(SUM(CASE WHEN p.kind = 'sick_leave' THEN e.minutes END), 0) AS s
       FROM time_entries e JOIN projects p ON p.id = e.project_id WHERE e.user_id = ? AND e.date = ?`,
      [userId, date],
    );
    return {
      workday: isWorkday(date, settings.workDays),
      vacationMinutes: Number(abs?.v ?? 0),
      sickMinutes: Number(abs?.s ?? 0),
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
    // Vacaciones y baja siempre se registran como "ausencia"; los proyectos normales no admiten ese tipo.
    let workType: WorkType;
    if (isAbsenceKind(project.kind)) {
      workType = 'ausencia';
    } else {
      if (!isWorkType(input.workType) || input.workType === 'ausencia') {
        throw new ValidationError('Selecciona el tipo de trabajo (Incidencia, Desarrollo o Mantenimiento).');
      }
      workType = input.workType;
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

    return { minutes, description, workType };
  }

  createEntry(input: EntryInput): TimeEntry {
    return this.store.transaction(() => {
      const { minutes, description, workType } = this.validateEntryInput(input, null);
      const nowDate = this.now();
      const since = new Date(nowDate.getTime() - DUPLICATE_WINDOW_MS).toISOString();
      const dup = this.store.get(
        `SELECT id FROM time_entries
         WHERE user_id = ? AND project_id = ? AND date = ? AND minutes = ? AND work_type = ?
           AND description = ? AND created_at >= ?`,
        [input.userId, input.projectId, input.date, minutes, workType, description, since],
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
        [input.userId, input.projectId, input.date, minutes, workType, description, t, t],
      );
      return this.getEntry(this.store.lastInsertId())!;
    });
  }

  updateEntry(id: number, input: EntryInput): TimeEntry {
    return this.store.transaction(() => {
      if (!this.getEntry(id)) throw new ValidationError('La imputación ya no existe.');
      const { minutes, description, workType } = this.validateEntryInput(input, id);
      this.store.run(
        `UPDATE time_entries SET user_id = ?, project_id = ?, date = ?, minutes = ?, work_type = ?,
                description = ?, updated_at = ? WHERE id = ?`,
        [input.userId, input.projectId, input.date, minutes, workType, description, this.ts(), id],
      );
      return this.getEntry(id)!;
    });
  }

  /** Última imputación del usuario (para «Repetir última tarea»). */
  lastEntry(userId: number): TimeEntry | null {
    // Se ignoran las ausencias: lo útil es repetir la última tarea de trabajo.
    return (
      this.queryEntries("WHERE e.user_id = ? AND p.kind IN ('normal', 'shared')", [userId], 'e.created_at DESC, e.id DESC LIMIT 1')[0] ??
      null
    );
  }

  /**
   * Registra vacaciones o baja en un rango de fechas, solo en días laborables.
   * Cada día recibe lo indicado o, si no se indica, lo que le falte para completar la jornada.
   */
  registerAbsence(input: AbsenceInput): AbsenceResult {
    if (!input || (input.kind !== 'vacation' && input.kind !== 'sick_leave')) {
      throw new ValidationError('Tipo de ausencia no válido.');
    }
    if (!Number.isInteger(input.userId) || !this.getUser(input.userId)) throw new ValidationError('Usuario no válido.');
    if (!isValidIsoDate(input.dateFrom) || !isValidIsoDate(input.dateTo)) {
      throw new ValidationError('Indica unas fechas válidas.');
    }
    if (input.dateTo < input.dateFrom) throw new ValidationError('La fecha final es anterior a la inicial.');
    const days = dateRange(input.dateFrom, input.dateTo, 367);
    if (days.at(-1) !== input.dateTo) throw new ValidationError('El periodo no puede superar un año.');
    if (input.minutesPerDay !== null) validateEntryMinutes(input.minutesPerDay);
    const description = validateDescription(input.description);
    const project = this.specialProject(input.kind);
    const label = projectKindLabel(input.kind);
    if (!project) {
      throw new ValidationError(`Primero configura el proyecto especial de ${label} en la sección «Proyectos».`);
    }
    if (!project.active) throw new ValidationError(`El proyecto de ${label} "${project.name}" está inactivo.`);

    const { maxDailyMinutes, workDays } = this.getSettings();
    const result: AbsenceResult = { dates: [], skippedFull: [], skippedNonWorking: 0, truncated: [] };
    return this.store.transaction(() => {
      const t = this.ts();
      for (const date of days) {
        if (!isWorkday(date, workDays)) {
          result.skippedNonWorking++;
          continue;
        }
        const pending = maxDailyMinutes - this.dayMinutes(input.userId, date);
        const minutes = input.minutesPerDay === null ? pending : Math.min(input.minutesPerDay, pending);
        if (minutes < SLOT_MINUTES) {
          result.skippedFull.push(date);
          continue;
        }
        if (input.minutesPerDay !== null && minutes < input.minutesPerDay) result.truncated.push(date);
        this.store.run(
          `INSERT INTO time_entries (user_id, project_id, date, minutes, work_type, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'ausencia', ?, ?, ?)`,
          [input.userId, project.id, date, minutes - (minutes % SLOT_MINUTES), description, t, t],
        );
        result.dates.push(date);
      }
      if (result.dates.length === 0) {
        throw new ValidationError(
          result.skippedFull.length
            ? 'Todos los días laborables del periodo ya tienen la jornada completa.'
            : 'El periodo no contiene días laborables.',
        );
      }
      return result;
    });
  }

  /**
   * Estadísticas sobre el mismo filtro del histórico.
   * La jornada esperada y los días pendientes se calculan para un único usuario.
   */
  stats(
    filter: HistoryFilter = {},
    today: string = todayIso(),
    distribution: SharedDistribution = 'none',
  ): StatsResult {
    const { rows } = this.history({ ...filter, sortBy: 'date', sortDir: 'asc' });
    const settings = this.getSettings();
    const isAbs = isAbsenceKind;
    const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
    const vacationMinutes = rows.filter((r) => r.projectKind === 'vacation').reduce((s, r) => s + r.minutes, 0);
    const sickMinutes = rows.filter((r) => r.projectKind === 'sick_leave').reduce((s, r) => s + r.minutes, 0);
    const workMinutes = totalMinutes - vacationMinutes - sickMinutes;

    const dateFrom = filter.dateFrom || rows[0]?.date || null;
    const dateTo = filter.dateTo || rows.at(-1)?.date || null;
    const users = new Set(rows.map((r) => r.userId));
    const userId = filter.userId ?? (users.size === 1 ? [...users][0] : users.size === 0 ? settings.currentUserId : null);

    // Por proyecto
    const projMap = new Map<number, StatsResult['byProject'][number]>();
    for (const r of rows) {
      const p = projMap.get(r.projectId) ?? {
        projectId: r.projectId,
        code: r.projectCode,
        name: r.projectName,
        kind: r.projectKind,
        active: r.projectActive,
        minutes: 0,
        directMinutes: 0,
        sharedMinutes: 0,
        percent: 0,
        entries: 0,
      };
      p.minutes += r.minutes;
      p.directMinutes += r.minutes;
      p.entries++;
      projMap.set(r.projectId, p);
    }
    // Las horas comunes del periodo se calculan sin los filtros de proyecto/búsqueda, para que el
    // selector de reparto siga disponible (y coherente) al filtrar por un proyecto concreto.
    const narrowed = !!(filter.projectId || (filter.search ?? '').trim());
    const sharedBase = narrowed ? this.history({ ...filter, projectId: null, search: '' }).rows : rows;
    const sharedMinutes = sharedBase.filter((r) => r.projectKind === 'shared').reduce((s, r) => s + r.minutes, 0);
    // Si se filtra por el propio proyecto común, no tiene sentido repartirlo.
    const filteringShared = !!filter.projectId && this.getProject(filter.projectId)?.kind === 'shared';
    const order = (k: ProjectKind) => (k === 'normal' ? 0 : k === 'shared' ? 1 : 2);
    let byProject: ProjectStat[] = [...projMap.values()]
      .map((p) => ({ ...p, percent: percentOf(p.minutes, isAbs(p.kind) ? totalMinutes : workMinutes) }))
      .sort((a, b) => order(a.kind) - order(b.kind) || b.minutes - a.minutes);
    let distributionTargets = 0;
    if (distribution !== 'none' && !filteringShared) {
      const d = this.distributeShared(filter, rows, distribution);
      if (d) {
        byProject = d.byProject;
        distributionTargets = d.targets;
      }
    }

    // Por tipo de trabajo (sobre el total)
    const typeMap = new Map<WorkType, number>();
    for (const r of rows) typeMap.set(r.workType, (typeMap.get(r.workType) ?? 0) + r.minutes);
    const byWorkType = (['desarrollo', 'incidencia', 'mantenimiento', 'ausencia'] as WorkType[])
      .filter((w) => typeMap.has(w))
      .map((w) => ({ workType: w, minutes: typeMap.get(w)!, percent: percentOf(typeMap.get(w)!, totalMinutes) }));

    // Por día (y días distintos)
    const dayMap = new Map<string, number>();
    const workDayMap = new Map<string, number>();
    const vacDays = new Set<string>();
    const sickDays = new Set<string>();
    for (const r of rows) {
      dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + r.minutes);
      if (isWorkKind(r.projectKind)) workDayMap.set(r.date, (workDayMap.get(r.date) ?? 0) + r.minutes);
      if (r.projectKind === 'vacation') vacDays.add(r.date);
      if (r.projectKind === 'sick_leave') sickDays.add(r.date);
    }
    // Evolución diaria: hasta hoy (o el final del periodo) y como mucho los últimos 92 días.
    let byDay: StatsResult['byDay'] = [];
    let byDayTruncated = false;
    if (dateFrom && dateTo) {
      const end = dateTo > today && today >= dateFrom ? today : dateTo;
      const start92 = addDays(end, -91);
      const start = start92 > dateFrom ? start92 : dateFrom;
      byDayTruncated = start > dateFrom;
      byDay = dateRange(start, end, 92).map((date) => ({
        date,
        minutes: dayMap.get(date) ?? 0,
        workday: isWorkday(date, settings.workDays),
      }));
    }

    // Jornada esperada y días pendientes (solo con un usuario y un periodo definidos).
    let workingDays: number | null = null;
    let expectedMinutes: number | null = null;
    let coveragePercent: number | null = null;
    let elapsedWorkingDays: number | null = null;
    const coveragePartial = !!(filter.projectId || filter.workType || (filter.search ?? '').trim());
    const incompleteDays: StatsResult['incompleteDays'] = [];
    if (userId && dateFrom && dateTo) {
      const userRows = rows.filter((r) => r.userId === userId);
      const perDay = new Map<string, number>();
      for (const r of userRows) perDay.set(r.date, (perDay.get(r.date) ?? 0) + r.minutes);
      const working = dateRange(dateFrom, dateTo).filter((d) => isWorkday(d, settings.workDays));
      workingDays = working.length;
      expectedMinutes = workingDays * settings.maxDailyMinutes;
      // Con filtros de proyecto/tipo/búsqueda la cobertura no tiene sentido (solo se ve una parte).
      // La cobertura solo mide los días ya transcurridos (un periodo como «Este año» incluye días futuros).
      const elapsed = working.filter((d) => d <= today);
      elapsedWorkingDays = elapsed.length;
      if (!coveragePartial && elapsed.length > 0) {
        const covered = elapsed.reduce((s, d) => s + Math.min(perDay.get(d) ?? 0, settings.maxDailyMinutes), 0);
        coveragePercent = Math.min(100, percentOf(covered, elapsed.length * settings.maxDailyMinutes));
        for (const d of working) {
          if (d > today) break;
          const m = perDay.get(d) ?? 0;
          if (m < settings.maxDailyMinutes) {
            incompleteDays.push({ date: d, imputedMinutes: m, pendingMinutes: settings.maxDailyMinutes - m });
          }
        }
      }
    }

    return {
      dateFrom,
      dateTo,
      userId,
      totalMinutes,
      workMinutes,
      vacationMinutes,
      sickMinutes,
      entryCount: rows.length,
      daysWithEntries: dayMap.size,
      avgWorkMinutesPerDay: workDayMap.size ? Math.round(workMinutes / workDayMap.size) : 0,
      vacationDays: vacDays.size,
      sickDays: sickDays.size,
      workingDays,
      expectedMinutes,
      coveragePercent,
      elapsedWorkingDays,
      coveragePartial,
      byDayTruncated,
      sharedMinutes,
      distribution: distributionTargets > 0 ? distribution : 'none',
      distributionTargets,
      narrowed,
      incompleteDays: incompleteDays.reverse().slice(0, 60),
      byProject,
      byWorkType,
      byDay,
    };
  }

  /**
   * Reparte (solo para mostrar, nunca se guarda) las horas de tareas comunes entre proyectos.
   * - proportional: según las horas directas de cada proyecto en el periodo.
   * - equal: a partes iguales entre los proyectos con horas en el periodo.
   * Si en el periodo no hay horas directas en ningún proyecto, se reparte entre los proyectos activos.
   * Los pesos se calculan sin los filtros de proyecto/búsqueda, para que un proyecto filtrado
   * reciba la misma parte que vería sin filtrar.
   */
  private distributeShared(
    filter: HistoryFilter,
    rows: TimeEntry[],
    distribution: Exclude<SharedDistribution, 'none'>,
  ): { byProject: ProjectStat[]; targets: number } | null {
    const narrowed = !!(filter.projectId || (filter.search ?? '').trim());
    const base = narrowed ? this.history({ ...filter, projectId: null, search: '' }).rows : rows;
    const shared = base.filter((r) => r.projectKind === 'shared').reduce((s, r) => s + r.minutes, 0);
    if (shared === 0) return null;

    const stats = new Map<number, ProjectStat>();
    for (const r of base) {
      if (r.projectKind === 'shared') continue;
      const p = stats.get(r.projectId) ?? {
        projectId: r.projectId,
        code: r.projectCode,
        name: r.projectName,
        kind: r.projectKind,
        active: r.projectActive,
        minutes: 0,
        directMinutes: 0,
        sharedMinutes: 0,
        percent: 0,
        entries: 0,
      };
      p.directMinutes += r.minutes;
      p.minutes += r.minutes;
      p.entries++;
      stats.set(r.projectId, p);
    }
    let targets = [...stats.values()].filter((p) => p.kind === 'normal' && p.directMinutes > 0);
    if (targets.length === 0) {
      for (const p of this.listProjects().filter((x) => x.kind === 'normal')) {
        const st: ProjectStat = {
          projectId: p.id,
          code: p.code,
          name: p.name,
          kind: 'normal',
          active: p.active,
          minutes: 0,
          directMinutes: 0,
          sharedMinutes: 0,
          percent: 0,
          entries: 0,
        };
        stats.set(p.id, st);
      }
      targets = [...stats.values()].filter((p) => p.kind === 'normal');
    }
    if (targets.length === 0) return null;
    const weightTotal = targets.reduce((s, p) => s + p.directMinutes, 0);
    for (const p of targets) {
      const share =
        distribution === 'proportional' && weightTotal > 0
          ? (shared * p.directMinutes) / weightTotal
          : shared / targets.length;
      p.sharedMinutes = share;
      p.minutes = p.directMinutes + share;
    }

    const work = [...stats.values()].filter((p) => p.kind === 'normal').reduce((s, p) => s + p.minutes, 0);
    const total = [...stats.values()].reduce((s, p) => s + p.minutes, 0);
    let list = [...stats.values()].map((p) => ({ ...p, percent: percentOf(p.minutes, isAbsenceKind(p.kind) ? total : work) }));
    if (narrowed) {
      // Solo los proyectos que devuelve el filtro (misma semántica de búsqueda que el histórico).
      const visible = new Set(rows.map((r) => r.projectId));
      if (filter.projectId) visible.add(filter.projectId);
      list = list.filter((p) => visible.has(p.projectId) && p.kind !== 'shared');
      if (list.length === 0) return null;
    }
    list.sort((a, b) => Number(isAbsenceKind(a.kind)) - Number(isAbsenceKind(b.kind)) || b.minutes - a.minutes);
    return { byProject: list, targets: targets.length };
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
        `SELECT e.*, u.name AS user_name, p.code AS project_code, p.name AS project_name, p.active AS project_active,
                p.kind AS project_kind
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

function validateKind(k: unknown): ProjectKind {
  if (k === undefined || k === null) return 'normal';
  if (k !== 'normal' && k !== 'shared' && k !== 'vacation' && k !== 'sick_leave') {
    throw new ValidationError('Tipo de proyecto no válido.');
  }
  return k;
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
    kind: (r.kind as ProjectKind) ?? 'normal',
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
    projectKind: (r.project_kind as ProjectKind) ?? 'normal',
    date: String(r.date),
    minutes: Number(r.minutes),
    workType: r.work_type as TimeEntry['workType'],
    description: String(r.description ?? ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
