import { beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, Store } from '../electron/db';
import { Repo } from '../electron/repo';
import {
  DEFAULT_SETTINGS,
  SCHEDULE_TEMPLATES,
  dayLimitFor,
  describeSchedule,
  expectedMinutesFor,
  inPeriod,
  scheduleFor,
  validateSettingsPatch,
  weekdayOf,
} from '../shared/rules';
import type { Settings, WorkSchedule } from '../shared/types';

let store: Store;
let repo: Repo;
let clock: number;
let userId: number;
let p1: number;
let p2: number;

const NORMAL: WorkSchedule = { id: 'normal', name: 'Normal', minutes: [0, 495, 495, 495, 495, 420, 0], period: null };
const SUMMER: WorkSchedule = {
  id: 'verano',
  name: 'Verano',
  minutes: [0, 420, 420, 420, 420, 420, 0],
  period: { from: '06-15', to: '09-15' },
};
// 2026-11-16 es lunes; 2026-11-20 viernes; 2026-11-21 sábado; 2026-07-15 miércoles.
const MON = '2026-11-16';
const FRI = '2026-11-20';
const SAT = '2026-11-21';
const SUMMER_WED = '2026-07-15';

beforeEach(async () => {
  store = await Store.open(null);
  clock = Date.UTC(2026, 10, 16, 9, 0, 0);
  repo = new Repo(store, () => new Date(clock));
  userId = repo.createUser('Alejandro').id;
  p1 = repo.createProject({ code: 'P-001', name: 'Portal clientes' }).id;
  p2 = repo.createProject({ code: 'P-002', name: 'Soporte' }).id;
});

describe('Reglas de horarios', () => {
  const s = (over: Partial<Settings> = {}): Settings => ({
    ...DEFAULT_SETTINGS,
    schedules: [NORMAL, SUMMER],
    activeScheduleId: 'normal',
    ...over,
  });

  it('comprueba las fechas de ejemplo', () => {
    expect([weekdayOf(MON), weekdayOf(FRI), weekdayOf(SAT), weekdayOf(SUMMER_WED)]).toEqual([1, 5, 6, 3]);
  });

  it('aplica el horario de temporada dentro de su periodo y el principal fuera', () => {
    expect(scheduleFor(SUMMER_WED, s()).id).toBe('verano');
    expect(scheduleFor('2026-06-15', s()).id).toBe('verano');
    expect(scheduleFor('2026-09-16', s()).id).toBe('normal');
    expect(expectedMinutesFor(MON, s())).toBe(495);
    expect(expectedMinutesFor(FRI, s())).toBe(420);
    expect(expectedMinutesFor(SUMMER_WED, s())).toBe(420);
    expect(expectedMinutesFor(SAT, s())).toBe(0);
  });

  it('en días no laborables permite imputar hasta la jornada más larga', () => {
    expect(dayLimitFor(SAT, s())).toBe(495);
  });

  it('el horario principal con periodo se usa todo el año', () => {
    expect(scheduleFor(MON, s({ activeScheduleId: 'verano' })).id).toBe('verano');
  });

  it('admite periodos que cruzan el fin de año', () => {
    const p = { from: '12-15', to: '01-10' };
    expect(inPeriod('2026-12-31', p)).toBe(true);
    expect(inPeriod('2027-01-05', p)).toBe(true);
    expect(inPeriod('2026-11-30', p)).toBe(false);
  });

  it('sin horarios usa la configuración clásica', () => {
    const legacy = { ...DEFAULT_SETTINGS, maxDailyMinutes: 480, workDays: [1, 2, 3] };
    expect(expectedMinutesFor(MON, legacy)).toBe(480);
    expect(expectedMinutesFor(FRI, legacy)).toBe(0);
  });

  it('describe un horario de forma compacta', () => {
    expect(describeSchedule(NORMAL)).toBe('L-J 8,25 h · V 7,00 h');
    expect(describeSchedule(SCHEDULE_TEMPLATES[1].make() as WorkSchedule)).toBe('L-V 7,00 h');
  });

  it('valida los horarios', () => {
    expect(() => validateSettingsPatch({ schedules: [] })).toThrow(/al menos un horario/);
    expect(() => validateSettingsPatch({ schedules: [{ ...NORMAL, minutes: [0, 0, 0, 0, 0, 0, 0] }] })).toThrow(/día laborable/);
    expect(() => validateSettingsPatch({ schedules: [{ ...NORMAL, minutes: [0, 500, 0, 0, 0, 0, 0] }] })).toThrow(/múltiplos/);
    expect(() => validateSettingsPatch({ schedules: [NORMAL, { ...SUMMER, id: 'normal' }] })).toThrow(/Identificador/);
    expect(() => validateSettingsPatch({ schedules: [{ ...SUMMER, period: { from: '02-30', to: '09-15' } }] })).toThrow(/periodo/);
  });

  it('valida apariencia', () => {
    expect(validateSettingsPatch({ accent: 'custom', customAccent: '#AABBCC' })).toEqual({ accent: 'custom', customAccent: '#aabbcc' });
    expect(() => validateSettingsPatch({ customAccent: 'red' })).toThrow();
    expect(() => validateSettingsPatch({ palette: 'neon' })).toThrow();
    expect(() => validateSettingsPatch({ wallpaper: 'x' })).toThrow();
    expect(() => validateSettingsPatch({ wallpaperIntensity: 5 })).toThrow();
    // La imagen de fondo solo la cambia el proceso principal.
    expect(validateSettingsPatch({ wallpaperImageId: '../../etc' })).toEqual({});
  });
});

describe('Horarios en el repositorio', () => {
  it('sin horarios guardados presenta el clásico y sigue aceptando la jornada antigua', () => {
    let s = repo.getSettings();
    expect(s.schedules).toHaveLength(1);
    expect(s.schedules[0].minutes).toEqual([0, 495, 495, 495, 495, 495, 0]);
    s = repo.updateSettings({ maxDailyMinutes: 420 });
    expect(s.schedules[0].minutes[1]).toBe(420);
  });

  it('el límite diario depende del día: viernes 7 h', () => {
    repo.updateSettings({ schedules: [NORMAL, SUMMER], activeScheduleId: 'normal' });
    expect(repo.daySummary(userId, FRI).maxMinutes).toBe(420);
    expect(() => repo.createEntry({ userId, projectId: p1, date: FRI, minutes: 450, workType: 'desarrollo' })).toThrow(
      /máximo diario de 7,00 h/,
    );
    expect(repo.createEntry({ userId, projectId: p1, date: MON, minutes: 495, workType: 'desarrollo' }).minutes).toBe(495);
    expect(repo.daySummary(userId, SUMMER_WED).maxMinutes).toBe(420);
  });

  it('sincroniza los campos clásicos con el horario principal', () => {
    const s = repo.updateSettings({ schedules: [NORMAL, SUMMER], activeScheduleId: 'normal' });
    expect(s.maxDailyMinutes).toBe(495);
    expect(s.workDays).toEqual([1, 2, 3, 4, 5]);
    expect(() => repo.updateSettings({ activeScheduleId: 'no-existe' })).toThrow(/no existe/);
  });

  it('las estadísticas usan la jornada de cada día', () => {
    repo.updateSettings({ schedules: [NORMAL], activeScheduleId: 'normal' });
    const st = repo.stats({ userId, dateFrom: MON, dateTo: '2026-11-22' }, '2026-11-22');
    expect(st.workingDays).toBe(5);
    expect(st.expectedMinutes).toBe(495 * 4 + 420);
    expect(st.uniformDailyMinutes).toBeNull();
    expect(st.incompleteDays.find((d) => d.date === FRI)?.pendingMinutes).toBe(420);
    expect(st.byDay.find((d) => d.date === FRI)?.expectedMinutes).toBe(420);
  });

  it('las ausencias completan la jornada de cada día', () => {
    repo.updateSettings({ schedules: [NORMAL], activeScheduleId: 'normal' });
    repo.createProject({ code: 'VAC', name: 'Vacaciones', kind: 'vacation' });
    const r = repo.registerAbsence({ userId, kind: 'vacation', dateFrom: MON, dateTo: '2026-11-22', minutesPerDay: null });
    expect(r.dates).toHaveLength(5);
    expect(repo.daySummary(userId, FRI).imputedMinutes).toBe(420);
    expect(repo.daySummary(userId, MON).imputedMinutes).toBe(495);
  });
});

describe('Rutinas', () => {
  const morning = () =>
    repo.createRoutine({
      userId,
      name: 'Mañanas',
      items: [
        { projectId: p1, minutes: 60, workType: 'mantenimiento', description: 'Revisar correo' },
        { projectId: p2, minutes: 90, workType: 'incidencia', description: 'Tickets' },
      ],
    });

  it('crea, lista y aplica una rutina', () => {
    const r = morning();
    expect(r.totalMinutes).toBe(150);
    expect(r.items.map((i) => i.projectName)).toEqual(['Portal clientes', 'Soporte']);
    const res = repo.applyRoutine(r.id, MON);
    expect(res).toMatchObject({ created: 2, minutes: 150, skipped: [] });
    const day = repo.day(userId, MON);
    expect(day.entries.map((e) => [e.projectId, e.minutes, e.description])).toEqual([
      [p1, 60, 'Revisar correo'],
      [p2, 90, 'Tickets'],
    ]);
    const listed = repo.listRoutines(userId, MON)[0];
    expect(listed.appliedOnDate).toBe(true);
    expect(listed.lastAppliedDate).toBe(MON);
    expect(repo.listRoutines(userId, FRI)[0].appliedOnDate).toBe(false);
  });

  it('respeta la jornada: imputa lo que cabe y omite el resto', () => {
    const r = morning();
    repo.createEntry({ userId, projectId: p1, date: MON, minutes: 420, workType: 'desarrollo' }); // quedan 75 min
    const res = repo.applyRoutine(r.id, MON);
    expect(res.minutes).toBe(75);
    expect(res.skipped).toEqual([{ projectName: 'Soporte', minutes: 75, reason: 'full' }]);
    expect(repo.daySummary(userId, MON).complete).toBe(true);
    expect(() => repo.applyRoutine(r.id, MON)).toThrow(/completa/);
  });

  it('omite proyectos inactivos y no permite crear rutinas con ellos', () => {
    const r = morning();
    repo.setProjectActive(p2, false);
    const res = repo.applyRoutine(r.id, MON);
    expect(res.skipped[0]).toMatchObject({ projectName: 'Soporte', reason: 'inactive' });
    expect(() =>
      repo.createRoutine({ userId, name: 'Otra', items: [{ projectId: p2, minutes: 60, workType: 'desarrollo', description: '' }] }),
    ).toThrow(/inactivo/);
    // Al editar una rutina que ya lo tenía se permite conservarlo.
    expect(repo.updateRoutine(r.id, { userId, name: 'Mañanas', items: r.items }).items).toHaveLength(2);
  });

  it('valida nombre, tareas y duplicados', () => {
    morning();
    expect(() => repo.createRoutine({ userId, name: ' ', items: [] })).toThrow(/nombre/);
    expect(() => repo.createRoutine({ userId, name: 'X', items: [] })).toThrow(/al menos una tarea/);
    expect(() =>
      repo.createRoutine({ userId, name: 'mañanas', items: [{ projectId: p1, minutes: 60, workType: 'desarrollo', description: '' }] }),
    ).toThrow(/Ya tienes/);
    expect(() =>
      repo.createRoutine({ userId, name: 'Y', items: [{ projectId: p1, minutes: 20, workType: 'desarrollo', description: '' }] }),
    ).toThrow(/múltiplos/);
  });

  it('no deja eliminar un proyecto usado en una rutina', () => {
    morning();
    expect(() => repo.deleteProject(p2)).toThrow(/rutina "Mañanas"/);
  });

  it('elimina una rutina sin tocar lo ya imputado', () => {
    const r = morning();
    repo.applyRoutine(r.id, MON);
    repo.deleteRoutine(r.id);
    expect(repo.listRoutines(userId)).toHaveLength(0);
    expect(repo.day(userId, MON).entries).toHaveLength(2);
  });

  it('aplica sola una vez al día las rutinas automáticas', () => {
    const r = morning();
    repo.updateRoutine(r.id, { userId, name: r.name, items: r.items, autoApply: true });
    expect(repo.autoApplyRoutines(userId, MON)).toHaveLength(1);
    expect(repo.autoApplyRoutines(userId, MON)).toHaveLength(0);
    expect(repo.day(userId, MON).entries).toHaveLength(2);
    // No laborable: no se aplica.
    expect(repo.autoApplyRoutines(userId, SAT)).toHaveLength(0);
  });

  it('no aplica rutinas automáticas en días de vacaciones', () => {
    const r = morning();
    repo.updateRoutine(r.id, { userId, name: r.name, items: r.items, autoApply: true });
    repo.createProject({ code: 'VAC', name: 'Vacaciones', kind: 'vacation' });
    repo.registerAbsence({ userId, kind: 'vacation', dateFrom: FRI, dateTo: FRI, minutesPerDay: 240 });
    expect(repo.autoApplyRoutines(userId, FRI)).toHaveLength(0);
    expect(repo.day(userId, FRI).entries).toHaveLength(1);
  });

  it('las rutinas con vacaciones se guardan como ausencia', () => {
    const vac = repo.createProject({ code: 'VAC', name: 'Vacaciones', kind: 'vacation' }).id;
    const r = repo.createRoutine({ userId, name: 'Libre', items: [{ projectId: vac, minutes: 60, workType: 'desarrollo', description: '' }] });
    expect(r.items[0].workType).toBe('ausencia');
  });
});

describe('Migración', () => {
  it('añade las tablas de rutinas a una base de datos de la versión anterior', async () => {
    const SQL = await (await import('../electron/db')).loadSqlJs();
    const old = new SQL.Database();
    for (let v = 0; v < MIGRATIONS.length - 1; v++) old.exec(MIGRATIONS[v]);
    old.exec(`PRAGMA user_version = ${MIGRATIONS.length - 1}`);
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gh-')), 'old.sqlite');
    fs.writeFileSync(file, old.export());
    const s2 = await Store.open(file);
    const r2 = new Repo(s2);
    const u = r2.createUser('Ana').id;
    const p = r2.createProject({ code: 'A', name: 'A' }).id;
    expect(r2.createRoutine({ userId: u, name: 'R', items: [{ projectId: p, minutes: 30, workType: 'desarrollo', description: '' }] }).id).toBe(1);
    s2.close();
  });
});
