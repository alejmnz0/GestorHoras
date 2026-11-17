import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../electron/db';
import { Repo } from '../electron/repo';
import { autoBackup, exportBackup, importBackup } from '../electron/backup';
import type { EntryInput } from '../shared/types';

let store: Store;
let repo: Repo;
let clock: number;
let userId: number;
let projectId: number;

const entry = (over: Partial<EntryInput> = {}): EntryInput => ({
  userId,
  projectId,
  date: '2026-11-16',
  minutes: 60,
  workType: 'desarrollo',
  description: '',
  ...over,
});

beforeEach(async () => {
  store = await Store.open(null);
  clock = Date.UTC(2026, 10, 16, 9, 0, 0);
  repo = new Repo(store, () => new Date(clock));
  userId = repo.createUser('Alejandro').id;
  projectId = repo.createProject({ code: 'P-001', name: 'Portal clientes' }).id;
});

const tick = (ms = 120_000) => (clock += ms);

describe('Registro de horas', () => {
  it('registra una imputación correcta', () => {
    const e = repo.createEntry(entry({ minutes: 90, description: '  Revisión  ' }));
    expect(e.minutes).toBe(90);
    expect(e.projectName).toBe('Portal clientes');
    expect(e.projectCode).toBe('P-001');
    expect(e.userName).toBe('Alejandro');
    expect(e.description).toBe('Revisión');
  });

  it('rechaza valores que no son múltiplos de 15 minutos', () => {
    expect(() => repo.createEntry(entry({ minutes: 20 }))).toThrow(/múltiplos/);
    expect(() => repo.createEntry(entry({ minutes: 10 }))).toThrow(/mínimo/);
    expect(() => repo.createEntry(entry({ minutes: 15.5 }))).toThrow();
  });

  it('rechaza horas cero o negativas', () => {
    expect(() => repo.createEntry(entry({ minutes: 0 }))).toThrow(/negativas/);
    expect(() => repo.createEntry(entry({ minutes: -15 }))).toThrow(/negativas/);
  });

  it('exige tipo de trabajo válido, proyecto, usuario y fecha', () => {
    expect(() => repo.createEntry(entry({ workType: 'otro' as never }))).toThrow(/tipo de trabajo/);
    expect(() => repo.createEntry(entry({ projectId: 999 }))).toThrow(/no existe/);
    expect(() => repo.createEntry(entry({ userId: 999 }))).toThrow(/usuario/);
    expect(() => repo.createEntry(entry({ date: '2026-02-30' }))).toThrow(/fecha/);
    expect(() => repo.createEntry(entry({ description: 'x'.repeat(501) }))).toThrow(/500/);
  });

  it('permite imputar días anteriores', () => {
    const e = repo.createEntry(entry({ date: '2025-01-10' }));
    expect(repo.day(userId, '2025-01-10').entries).toHaveLength(1);
    expect(e.date).toBe('2025-01-10');
  });

  it('evita duplicados accidentales pero permite repetir pasado el margen', () => {
    repo.createEntry(entry());
    expect(() => repo.createEntry(entry())).toThrow(/duplicado/);
    tick(61_000);
    expect(() => repo.createEntry(entry())).not.toThrow();
  });
});

describe('Límite diario', () => {
  it('permite llegar exactamente a 8,25 h y no superarlo', () => {
    repo.createEntry(entry({ minutes: 480 }));
    tick();
    repo.createEntry(entry({ minutes: 15, workType: 'incidencia' }));
    const s = repo.daySummary(userId, '2026-11-16');
    expect(s.imputedMinutes).toBe(495);
    expect(s.pendingMinutes).toBe(0);
    expect(s.complete).toBe(true);
    expect(s.percent).toBe(100);
    tick();
    expect(() => repo.createEntry(entry({ minutes: 15 }))).toThrow(/completa/);
  });

  it('indica cuánto se puede imputar todavía', () => {
    repo.createEntry(entry({ minutes: 450 }));
    tick();
    expect(() => repo.createEntry(entry({ minutes: 60 }))).toThrow(/0,75 h más/);
  });

  it('el límite es por usuario y por día', () => {
    repo.createEntry(entry({ minutes: 495 }));
    const other = repo.createUser('Lucía').id;
    expect(() => repo.createEntry(entry({ userId: other, minutes: 495 }))).not.toThrow();
    expect(() => repo.createEntry(entry({ date: '2026-11-17', minutes: 495 }))).not.toThrow();
  });

  it('respeta la jornada configurada', () => {
    repo.updateSettings({ maxDailyMinutes: 420 });
    expect(() => repo.createEntry(entry({ minutes: 435 }))).toThrow(/7,00 h/);
    expect(() => repo.createEntry(entry({ minutes: 420 }))).not.toThrow();
  });

  it('calcula horas pendientes y porcentaje (ejemplo 5,50 de 8,25)', () => {
    repo.createEntry(entry({ minutes: 330 }));
    const s = repo.daySummary(userId, '2026-11-16');
    expect(s.pendingMinutes).toBe(165); // 2,75 h
    expect(s.percent).toBe(66.67);
    expect(s.complete).toBe(false);
  });
});

describe('Edición y eliminación', () => {
  it('al editar descuenta el valor anterior del propio registro', () => {
    const a = repo.createEntry(entry({ minutes: 300 }));
    tick();
    repo.createEntry(entry({ minutes: 195, workType: 'mantenimiento' })); // total 495
    // Subir 'a' de 300 a 300 (sin cambios) o bajarlo debe estar permitido aunque el día esté lleno
    expect(() => repo.updateEntry(a.id, entry({ minutes: 300 }))).not.toThrow();
    expect(() => repo.updateEntry(a.id, entry({ minutes: 240 }))).not.toThrow();
    // Ahora quedan 60 min libres: subir a 300 sí, a 315 no.
    expect(() => repo.updateEntry(a.id, entry({ minutes: 315 }))).toThrow(/Solo puedes imputar 5,00 h/);
    expect(repo.updateEntry(a.id, entry({ minutes: 300, description: 'ok' })).description).toBe('ok');
  });

  it('al mover un registro a otro día valida el límite de ese día', () => {
    const a = repo.createEntry(entry({ minutes: 120 }));
    repo.createEntry(entry({ date: '2026-11-17', minutes: 450 }));
    expect(() => repo.updateEntry(a.id, entry({ date: '2026-11-17', minutes: 120 }))).toThrow(/0,75 h más/);
  });

  it('elimina registros y actualiza el resumen', () => {
    const a = repo.createEntry(entry({ minutes: 120 }));
    repo.deleteEntry(a.id);
    expect(repo.daySummary(userId, '2026-11-16').imputedMinutes).toBe(0);
    expect(() => repo.deleteEntry(a.id)).toThrow(/no existe/);
  });
});

describe('Proyectos', () => {
  it('impide códigos duplicados (sin distinguir mayúsculas)', () => {
    expect(() => repo.createProject({ code: 'p-001', name: 'Otro' })).toThrow(/ya está en uso/);
    const b = repo.createProject({ code: 'P-002', name: 'Otro' });
    expect(() => repo.updateProject(b.id, { code: 'P-001', name: 'Otro' })).toThrow(/ya está en uso/);
  });

  it('los inactivos no aparecen para nuevas imputaciones y no se pueden usar', () => {
    repo.setProjectActive(projectId, false);
    expect(repo.listProjects().map((p) => p.id)).not.toContain(projectId);
    expect(repo.listProjects({ includeInactive: true }).map((p) => p.id)).toContain(projectId);
    expect(() => repo.createEntry(entry())).toThrow(/inactivo/);
  });

  it('se conservan en el histórico y se pueden editar registros antiguos de un proyecto inactivo', () => {
    const e = repo.createEntry(entry());
    repo.setProjectActive(projectId, false);
    expect(repo.history({}).rows[0].projectActive).toBe(false);
    expect(() => repo.updateEntry(e.id, entry({ minutes: 30 }))).not.toThrow();
  });

  it('no elimina proyectos con imputaciones, sí los vacíos', () => {
    repo.createEntry(entry());
    expect(() => repo.deleteProject(projectId)).toThrow(/Desactívalo/);
    const empty = repo.createProject({ code: 'TMP', name: 'Temporal' });
    repo.deleteProject(empty.id);
    expect(repo.getProject(empty.id)).toBeUndefined();
  });

  it('busca por nombre o código', () => {
    repo.createProject({ code: 'INT-9', name: 'Intranet' });
    expect(repo.listProjects({ search: 'intra' }).map((p) => p.code)).toEqual(['INT-9']);
    expect(repo.listProjects({ search: 'p-0' }).map((p) => p.code)).toEqual(['P-001']);
    expect(repo.listProjects({ search: '%' })).toHaveLength(0);
  });
});

describe('Histórico', () => {
  beforeEach(() => {
    const p2 = repo.createProject({ code: 'B-1', name: 'Backoffice' }).id;
    const u2 = repo.createUser('Beatriz').id;
    repo.createEntry(entry({ date: '2026-11-10', minutes: 60 }));
    repo.createEntry(entry({ date: '2026-11-12', minutes: 120, projectId: p2, workType: 'incidencia' }));
    repo.createEntry(entry({ date: '2026-11-14', minutes: 30, userId: u2, workType: 'mantenimiento' }));
  });

  it('filtra y totaliza', () => {
    expect(repo.history({}).totalMinutes).toBe(210);
    expect(repo.history({ search: 'back' }).rows).toHaveLength(1);
    expect(repo.history({ workType: 'mantenimiento' }).rows[0].userName).toBe('Beatriz');
    expect(repo.history({ dateFrom: '2026-11-11', dateTo: '2026-11-13' }).totalMinutes).toBe(120);
    expect(repo.history({ userId }).rows).toHaveLength(2);
    expect(repo.history({ projectId }).rows).toHaveLength(2);
  });

  it('ordena por fecha, horas, proyecto y usuario', () => {
    expect(repo.history({ sortBy: 'date', sortDir: 'asc' }).rows.map((r) => r.date)[0]).toBe('2026-11-10');
    expect(repo.history({ sortBy: 'hours', sortDir: 'desc' }).rows[0].minutes).toBe(120);
    expect(repo.history({ sortBy: 'project', sortDir: 'asc' }).rows[0].projectName).toBe('Backoffice');
    expect(repo.history({ sortBy: 'user', sortDir: 'asc' }).rows[0].userName).toBe('Alejandro');
  });
});

describe('Usuarios y configuración', () => {
  it('no permite nombres vacíos ni duplicados', () => {
    expect(() => repo.createUser('  ')).toThrow(/obligatorio/);
    expect(() => repo.createUser('alejandro')).toThrow(/Ya existe/);
  });

  it('persiste la configuración y valida valores', () => {
    const s = repo.updateSettings({ currentUserId: userId, reminderIntervalMinutes: 45, soundVolume: 80 });
    expect(s.currentUserId).toBe(userId);
    expect(s.reminderIntervalMinutes).toBe(45);
    expect(s.maxDailyMinutes).toBe(495);
    expect(() => repo.updateSettings({ maxDailyMinutes: 500 })).toThrow(/múltiplo/);
    expect(() => repo.updateSettings({ soundVolume: 101 })).toThrow(/volumen/);
    expect(() => repo.updateSettings({ currentUserId: 999 })).toThrow(/no existe/);
    const reset = repo.resetSettings();
    expect(reset.reminderIntervalMinutes).toBe(30);
    expect(reset.currentUserId).toBe(userId);
  });
});

describe('Persistencia y copias de seguridad', () => {
  it('los datos sobreviven a cerrar y reabrir la aplicación', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
    const file = path.join(dir, 'db.sqlite');
    const s1 = await Store.open(file);
    const r1 = new Repo(s1);
    const u = r1.createUser('Ana');
    const p = r1.createProject({ code: 'X', name: 'Proyecto X' });
    r1.createEntry({ userId: u.id, projectId: p.id, date: '2026-11-16', minutes: 45, workType: 'incidencia' });
    r1.updateSettings({ currentUserId: u.id, maxDailyMinutes: 480 });
    s1.close();

    const s2 = await Store.open(file);
    const r2 = new Repo(s2);
    expect(r2.history({}).rows[0].minutes).toBe(45);
    expect(r2.getSettings().currentUserId).toBe(u.id);
    expect(r2.getSettings().maxDailyMinutes).toBe(480);
    expect(fs.existsSync(file + '.tmp')).toBe(false);
    s2.close();
  });

  it('exporta e importa una copia, guardando antes los datos actuales', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
    repo.createEntry(entry({ minutes: 75 }));
    const backupFile = path.join(dir, 'copia.sqlite');
    exportBackup(store, backupFile);

    const other = await Store.open(path.join(dir, 'otro.sqlite'));
    const otherRepo = new Repo(other);
    expect(otherRepo.history({}).rows).toHaveLength(0);
    const safety = importBackup(other, backupFile, path.join(dir, 'copias'));
    expect(fs.existsSync(safety)).toBe(true);
    expect(otherRepo.history({}).rows[0].minutes).toBe(75);
    // Persistido en disco
    const reopened = new Repo(await Store.open(path.join(dir, 'otro.sqlite')));
    expect(reopened.history({}).totalMinutes).toBe(75);
  });

  it('rechaza ficheros que no son copias válidas sin tocar los datos', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
    const bad = path.join(dir, 'malo.sqlite');
    fs.writeFileSync(bad, 'esto no es sqlite');
    repo.createEntry(entry());
    expect(() => importBackup(store, bad, path.join(dir, 'copias'))).toThrow(/no es SQLite/);
    expect(repo.history({}).rows).toHaveLength(1);
  });

  it('crea copias automáticas diarias y conserva solo las últimas', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
    const db = path.join(dir, 'db.sqlite');
    fs.writeFileSync(db, store.exportBytes());
    const bdir = path.join(dir, 'copias');
    for (let d = 1; d <= 12; d++) autoBackup(db, bdir, `2026-11-${String(d).padStart(2, '0')}`);
    const files = fs.readdirSync(bdir).sort();
    expect(files).toHaveLength(10);
    expect(files[0]).toBe('auto-2026-11-03.sqlite');
  });
});

describe('Casos límite detectados en revisión', () => {
  it('permite reducir o editar un registro aunque el día supere una jornada reducida', () => {
    const a = repo.createEntry(entry({ minutes: 240 }));
    tick();
    repo.createEntry(entry({ minutes: 240, workType: 'incidencia' }));
    repo.updateSettings({ maxDailyMinutes: 360 });
    expect(() => repo.updateEntry(a.id, entry({ minutes: 240, description: 'solo texto' }))).not.toThrow();
    expect(() => repo.updateEntry(a.id, entry({ minutes: 120 }))).not.toThrow();
    expect(() => repo.updateEntry(a.id, entry({ minutes: 135 }))).toThrow(/completa|Solo puedes/);
  });

  it('rechaza copias con las mismas tablas pero distinta estructura', async () => {
    const { loadSqlJs } = await import('../electron/db');
    const SQL = await loadSqlJs();
    const fake = new SQL.Database();
    fake.exec('CREATE TABLE users(x);CREATE TABLE projects(x);CREATE TABLE time_entries(x);CREATE TABLE settings(x);PRAGMA user_version=1;');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
    const f = path.join(dir, 'fake.sqlite');
    fs.writeFileSync(f, fake.export());
    repo.createEntry(entry());
    expect(() => importBackup(store, f, path.join(dir, 'c'))).toThrow(/estructura distinta|formato que esta versión no reconoce/);
    expect(repo.history({}).rows).toHaveLength(1);
  });

  it('un fallo al escribir en disco no deshace lo confirmado y se reintenta', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
    const s = await Store.open(path.join(dir, 'db.sqlite'));
    const r = new Repo(s);
    const errors: unknown[] = [];
    s.onPersistError = (e) => errors.push(e);
    const original = s.persist.bind(s);
    s.persist = () => {
      throw new Error('EBUSY');
    };
    const u = r.createUser('Disco');
    expect(u.name).toBe('Disco');
    expect(s.dirty).toBe(true);
    expect(errors).toHaveLength(1);
    s.persist = original;
    expect(s.safePersist()).toBe(true);
    expect(new Repo(await Store.open(path.join(dir, 'db.sqlite'))).listUsers()[0].name).toBe('Disco');
  });
});

describe('Vacaciones, baja y proyectos especiales', () => {
  // 2026-11-16 es lunes
  let vac: number;
  beforeEach(() => {
    vac = repo.createProject({ code: 'VAC', name: 'Vacaciones', kind: 'vacation' }).id;
  });

  it('solo puede haber un proyecto de cada tipo especial', () => {
    expect(() => repo.createProject({ code: 'VAC2', name: 'Otras', kind: 'vacation' })).toThrow(/Solo puede haber uno/);
    expect(() => repo.createProject({ code: 'BAJA', name: 'Baja', kind: 'sick_leave' })).not.toThrow();
    expect(() => repo.updateProject(projectId, { code: 'P-001', name: 'Portal', kind: 'vacation' })).toThrow(/Solo puede/);
  });

  it('no cambia el tipo de un proyecto con imputaciones', () => {
    repo.createEntry(entry());
    expect(() => repo.updateProject(projectId, { code: 'P-001', name: 'Portal', kind: 'sick_leave' })).toThrow(
      /tipo de un proyecto/,
    );
  });

  it('las imputaciones a proyectos especiales son siempre "ausencia" y los normales no la admiten', () => {
    const e = repo.createEntry(entry({ projectId: vac, workType: 'desarrollo', minutes: 240 }));
    expect(e.workType).toBe('ausencia');
    expect(e.projectKind).toBe('vacation');
    expect(() => repo.createEntry(entry({ workType: 'ausencia' }))).toThrow(/tipo de trabajo/);
    const s = repo.daySummary(userId, '2026-11-16');
    expect(s.vacationMinutes).toBe(240);
    expect(s.workday).toBe(true);
  });

  it('registra vacaciones en un rango saltando fines de semana y completando lo pendiente', () => {
    repo.createEntry(entry({ date: '2026-11-18', minutes: 120 })); // miércoles con 2 h
    repo.createEntry(entry({ date: '2026-11-19', minutes: 495, workType: 'incidencia' })); // jueves completo
    const r = repo.registerAbsence({ userId, kind: 'vacation', dateFrom: '2026-11-16', dateTo: '2026-11-23', minutesPerDay: null });
    expect(r.dates).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-20', '2026-11-23']);
    expect(r.skippedFull).toEqual(['2026-11-19']);
    expect(r.skippedNonWorking).toBe(2);
    expect(repo.daySummary(userId, '2026-11-18').complete).toBe(true);
    expect(repo.daySummary(userId, '2026-11-18').vacationMinutes).toBe(375);
    expect(repo.daySummary(userId, '2026-11-16').vacationMinutes).toBe(495);
  });

  it('permite medias jornadas y exige proyecto de baja configurado', () => {
    const r = repo.registerAbsence({ userId, kind: 'vacation', dateFrom: '2026-11-16', dateTo: '2026-11-16', minutesPerDay: 240 });
    expect(r.dates).toHaveLength(1);
    expect(repo.daySummary(userId, '2026-11-16').imputedMinutes).toBe(240);
    expect(() =>
      repo.registerAbsence({ userId, kind: 'sick_leave', dateFrom: '2026-11-16', dateTo: '2026-11-16', minutesPerDay: null }),
    ).toThrow(/configura el proyecto especial de Baja/);
  });

  it('valida periodos', () => {
    expect(() => repo.registerAbsence({ userId, kind: 'vacation', dateFrom: '2026-11-20', dateTo: '2026-11-16', minutesPerDay: null })).toThrow(/anterior/);
    expect(() => repo.registerAbsence({ userId, kind: 'vacation', dateFrom: '2026-11-21', dateTo: '2026-11-22', minutesPerDay: null })).toThrow(/laborables/);
    expect(() => repo.registerAbsence({ userId, kind: 'vacation', dateFrom: '2026-01-01', dateTo: '2027-06-01', minutesPerDay: null })).toThrow(/un año/);
  });

  it('los días laborables son configurables', () => {
    repo.updateSettings({ workDays: [1, 2, 3, 4, 5, 6] });
    const r = repo.registerAbsence({ userId, kind: 'vacation', dateFrom: '2026-11-21', dateTo: '2026-11-22', minutesPerDay: null });
    expect(r.dates).toEqual(['2026-11-21']);
    expect(() => repo.updateSettings({ workDays: [] })).toThrow(/al menos/);
  });
});

describe('Repetir última tarea', () => {
  it('devuelve la última imputación creada del usuario', () => {
    expect(repo.lastEntry(userId)).toBeNull();
    repo.createEntry(entry({ date: '2026-11-20', minutes: 30 }));
    tick();
    const last = repo.createEntry(entry({ date: '2026-11-10', minutes: 45, description: 'última' }));
    expect(repo.lastEntry(userId)?.id).toBe(last.id);
  });
});

describe('Estadísticas', () => {
  beforeEach(() => {
    const p2 = repo.createProject({ code: 'B', name: 'Backoffice' }).id;
    const vac = repo.createProject({ code: 'VAC', name: 'Vacaciones', kind: 'vacation' }).id;
    // Semana del 16 al 22/11/2026 (L-D). Jornada 8,25 h = 495 min.
    repo.createEntry(entry({ date: '2026-11-16', minutes: 300 }));
    repo.createEntry(entry({ date: '2026-11-16', minutes: 195, projectId: p2, workType: 'incidencia' }));
    repo.createEntry(entry({ date: '2026-11-17', minutes: 240, projectId: p2, workType: 'mantenimiento' }));
    repo.createEntry(entry({ date: '2026-11-18', minutes: 495, projectId: vac }));
  });

  it('calcula horas por proyecto, porcentajes, cobertura y días pendientes', () => {
    const s = repo.stats({ dateFrom: '2026-11-16', dateTo: '2026-11-22' }, '2026-11-20');
    expect(s.totalMinutes).toBe(1230);
    expect(s.workMinutes).toBe(735);
    expect(s.vacationMinutes).toBe(495);
    expect(s.vacationDays).toBe(1);
    expect(s.workingDays).toBe(5);
    expect(s.expectedMinutes).toBe(2475);
    // cubiertos: 495 + 240 + 495 = 1230 de 2475
    expect(s.coveragePercent).toBe(49.7);
    const portal = s.byProject.find((p) => p.code === 'P-001')!;
    expect(portal.minutes).toBe(300);
    expect(portal.percent).toBe(40.82); // 300 / 735 (sin ausencias)
    expect(s.byProject.at(-1)!.kind).toBe('vacation'); // ausencias al final
    expect(s.incompleteDays.map((d) => d.date)).toEqual(['2026-11-20', '2026-11-19', '2026-11-17']);
    expect(s.incompleteDays[2].pendingMinutes).toBe(255);
    expect(s.byDay).toHaveLength(5); // hasta «hoy» (20/11)
    const past = repo.stats({ dateFrom: '2026-11-16', dateTo: '2026-11-22' }, '2026-11-30');
    expect(past.byDay).toHaveLength(7);
    expect(past.byDay.find((d) => d.date === '2026-11-22')!.workday).toBe(false);
    expect(s.avgWorkMinutesPerDay).toBe(368); // 735 / 2 días con trabajo
    expect(s.byWorkType.map((w) => w.workType)).toEqual(['desarrollo', 'incidencia', 'mantenimiento', 'ausencia']);
  });

  it('con filtro de proyecto no calcula cobertura engañosa', () => {
    const s = repo.stats({ dateFrom: '2026-11-16', dateTo: '2026-11-22', projectId });
    expect(s.totalMinutes).toBe(300);
    expect(s.coveragePercent).toBeNull();
    expect(s.incompleteDays).toHaveLength(0);
    expect(s.expectedMinutes).toBe(2475);
  });

  it('sin datos devuelve ceros sin fallar', () => {
    const s = repo.stats({ dateFrom: '2025-01-01', dateTo: '2025-01-31', userId });
    expect(s.totalMinutes).toBe(0);
    expect(s.incompleteDays.length).toBeGreaterThan(0);
  });
});

describe('Migración v1 → v2', () => {
  it('actualiza una base de datos antigua conservando los datos', async () => {
    const { loadSqlJs, MIGRATIONS } = await import('../electron/db');
    const SQL = await loadSqlJs();
    const old = new SQL.Database();
    old.exec(MIGRATIONS[0]);
    old.exec('PRAGMA user_version = 1');
    old.exec(`INSERT INTO users VALUES (1,'Ana','x','x'); INSERT INTO projects VALUES (1,'P','Proy',1,'x','x');
      INSERT INTO time_entries VALUES (7,1,1,'2026-01-05',60,'desarrollo','antes','x','x');`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
    const f = path.join(dir, 'v1.sqlite');
    fs.writeFileSync(f, old.export());
    const s = await Store.open(f);
    const r = new Repo(s);
    expect(r.history({}).rows[0]).toMatchObject({ id: 7, description: 'antes', projectKind: 'normal' });
    expect(r.listProjects()[0].kind).toBe('normal');
    expect(s.get<{ v: number }>('PRAGMA user_version')).toEqual({ user_version: 2 });
  });
});

describe('Cobertura con periodos que incluyen días futuros', () => {
  it('solo mide los días ya transcurridos', () => {
    repo.createEntry(entry({ date: '2026-11-16', minutes: 495 }));
    const s = repo.stats({ dateFrom: '2026-11-16', dateTo: '2026-11-30' }, '2026-11-16');
    expect(s.workingDays).toBe(11);
    expect(s.elapsedWorkingDays).toBe(1);
    expect(s.coveragePercent).toBe(100);
    expect(s.incompleteDays).toHaveLength(0);
  });
});

describe('Correcciones de la revisión v1.1', () => {
  it('«Repetir última tarea» ignora las ausencias', () => {
    const vac = repo.createProject({ code: 'VAC', name: 'Vacaciones', kind: 'vacation' }).id;
    const work = repo.createEntry(entry({ minutes: 60 }));
    tick();
    repo.createEntry(entry({ projectId: vac, minutes: 120, date: '2026-11-17' }));
    expect(repo.lastEntry(userId)?.id).toBe(work.id);
  });

  it('avisa de los días en los que solo cabía parte de la ausencia', () => {
    repo.createProject({ code: 'VAC', name: 'Vacaciones', kind: 'vacation' });
    repo.createEntry(entry({ minutes: 360 }));
    const r = repo.registerAbsence({ userId, kind: 'vacation', dateFrom: '2026-11-16', dateTo: '2026-11-17', minutesPerDay: 240 });
    expect(r.truncated).toEqual(['2026-11-16']);
    expect(repo.daySummary(userId, '2026-11-16').imputedMinutes).toBe(495);
  });

  it('la evolución diaria muestra los últimos 92 días hasta hoy', () => {
    repo.createEntry(entry({ date: '2026-11-16' }));
    const s = repo.stats({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }, '2026-11-17');
    expect(s.byDay).toHaveLength(92);
    expect(s.byDay.at(-1)!.date).toBe('2026-11-17');
    expect(s.byDayTruncated).toBe(true);
  });

  it('distingue cobertura no aplicable por filtros y por periodo futuro', () => {
    expect(repo.stats({ dateFrom: '2026-11-16', dateTo: '2026-11-20', projectId }, '2026-11-20').coveragePartial).toBe(true);
    const fut = repo.stats({ dateFrom: '2027-01-04', dateTo: '2027-01-08', userId }, '2026-11-17');
    expect(fut.coveragePartial).toBe(false);
    expect(fut.elapsedWorkingDays).toBe(0);
    expect(fut.coveragePercent).toBeNull();
  });

  it('guarda una copia de la base de datos antes de migrar el esquema', async () => {
    const { loadSqlJs, MIGRATIONS } = await import('../electron/db');
    const SQL = await loadSqlJs();
    const old = new SQL.Database();
    old.exec(MIGRATIONS[0]);
    old.exec('PRAGMA user_version = 1');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
    const f = path.join(dir, 'db.sqlite');
    fs.writeFileSync(f, old.export());
    await Store.open(f);
    expect(fs.existsSync(`${f}.antes-v${MIGRATIONS.length}.bak`)).toBe(true);
  });
});
