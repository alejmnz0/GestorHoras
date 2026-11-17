/**
 * Acceso a SQLite mediante sql.js (SQLite compilado a WebAssembly).
 *
 * Por qué sql.js y no un módulo nativo: no requiere compilar nada para Windows,
 * el instalador funciona en cualquier equipo y no hay problemas de versiones de Node/Electron.
 * La base de datos vive en memoria y se vuelca a disco de forma ATÓMICA tras cada escritura
 * (fichero temporal + rename), por lo que un cierre inesperado nunca deja el fichero a medias.
 */
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';

export type Params = SqlValue[] | Record<string, SqlValue>;

let sqlPromise: Promise<SqlJsStatic> | null = null;
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) sqlPromise = initSqlJs();
  return sqlPromise;
}

/** Migraciones ordenadas. NUNCA modificar una ya publicada: añadir una nueva al final. */
export const MIGRATIONS: string[] = [
  // v1: esquema inicial
  `
  CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE TABLE projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(code)) > 0),
    name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  -- Las horas se guardan como MINUTOS enteros (15 min = 0,25 h) para evitar errores decimales.
  CREATE TABLE time_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    date        TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    minutes     INTEGER NOT NULL CHECK (minutes >= 15 AND minutes % 15 = 0 AND minutes <= 1440),
    work_type   TEXT    NOT NULL CHECK (work_type IN ('incidencia', 'desarrollo', 'mantenimiento')),
    description TEXT    NOT NULL DEFAULT '' CHECK (length(description) <= 500),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE INDEX idx_entries_user_date ON time_entries(user_id, date);
  CREATE INDEX idx_entries_date      ON time_entries(date);
  CREATE INDEX idx_entries_project   ON time_entries(project_id);

  CREATE TABLE settings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT    NOT NULL UNIQUE,
    value       TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  `,
  // v2: proyectos especiales (vacaciones / baja) y tipo de trabajo "ausencia".
  //     SQLite no permite cambiar un CHECK, así que time_entries se reconstruye conservando los datos.
  `
  ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal'
    CHECK (kind IN ('normal', 'vacation', 'sick_leave'));
  CREATE UNIQUE INDEX idx_projects_special_kind ON projects(kind) WHERE kind <> 'normal';

  CREATE TABLE time_entries_v2 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    date        TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    minutes     INTEGER NOT NULL CHECK (minutes >= 15 AND minutes % 15 = 0 AND minutes <= 1440),
    work_type   TEXT    NOT NULL CHECK (work_type IN ('incidencia', 'desarrollo', 'mantenimiento', 'ausencia')),
    description TEXT    NOT NULL DEFAULT '' CHECK (length(description) <= 500),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  INSERT INTO time_entries_v2 (id, user_id, project_id, date, minutes, work_type, description, created_at, updated_at)
    SELECT id, user_id, project_id, date, minutes, work_type, description, created_at, updated_at FROM time_entries;
  DROP TABLE time_entries;
  ALTER TABLE time_entries_v2 RENAME TO time_entries;
  CREATE INDEX idx_entries_user_date ON time_entries(user_id, date);
  CREATE INDEX idx_entries_date      ON time_entries(date);
  CREATE INDEX idx_entries_project   ON time_entries(project_id);
  `,
  // v3: tipo de proyecto «shared» (tareas comunes a todos los proyectos).
  //     Se reconstruye projects para ampliar el CHECK de kind, conservando ids y datos.
  `
  CREATE TABLE projects_v3 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(code)) > 0),
    name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    kind        TEXT    NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'shared', 'vacation', 'sick_leave'))
  );
  INSERT INTO projects_v3 (id, code, name, active, created_at, updated_at, kind)
    SELECT id, code, name, active, created_at, updated_at, kind FROM projects;
  DROP TABLE projects;
  ALTER TABLE projects_v3 RENAME TO projects;
  CREATE UNIQUE INDEX idx_projects_special_kind ON projects(kind) WHERE kind <> 'normal';
  `,
];

export const REQUIRED_TABLES = ['users', 'projects', 'time_entries', 'settings'];
const REQUIRED_COLUMNS: Record<string, string[]> = {
  users: ['id', 'name', 'created_at', 'updated_at'],
  projects: ['id', 'code', 'name', 'active', 'kind', 'created_at', 'updated_at'],
  time_entries: ['id', 'user_id', 'project_id', 'date', 'minutes', 'work_type', 'description', 'created_at', 'updated_at'],
  settings: ['id', 'key', 'value', 'updated_at'],
};

export class Store {
  private constructor(
    private SQL: SqlJsStatic,
    private db: Database,
    /** Ruta del fichero o null para una base de datos solo en memoria (tests). */
    readonly filePath: string | null,
  ) {}

  /** Abre (o crea) la base de datos y aplica las migraciones pendientes. */
  static async open(filePath: string | null): Promise<Store> {
    const SQL = await loadSqlJs();
    let db: Database;
    if (filePath && fs.existsSync(filePath)) {
      db = new SQL.Database(fs.readFileSync(filePath));
      // Antes de actualizar el esquema se guarda una copia del fichero tal cual estaba.
      const version = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0);
      if (version > 0 && version < MIGRATIONS.length) {
        fs.copyFileSync(filePath, `${filePath}.antes-v${MIGRATIONS.length}.bak`);
      }
    } else {
      db = new SQL.Database();
    }
    const store = new Store(SQL, db, filePath);
    store.prepareConnection();
    store.persist();
    return store;
  }

  private prepareConnection() {
    this.db.exec('PRAGMA foreign_keys = ON;');
    migrate(this.db);
  }

  run(sql: string, params: Params = []): void {
    this.db.run(sql, params);
  }

  all<T = Record<string, SqlValue>>(sql: string, params: Params = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Record<string, SqlValue>>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  lastInsertId(): number {
    return Number(this.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id);
  }

  /** Indica si hay cambios confirmados en memoria que no se pudieron escribir a disco. */
  dirty = false;
  /** Se invoca si falla la escritura a disco (para registrarlo en el log). */
  onPersistError: (e: unknown) => void = () => {};

  /** Ejecuta `fn` en una transacción y guarda en disco si termina bien. */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    let result: T;
    try {
      result = fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    // Fuera del try: un fallo de disco no debe provocar un ROLLBACK sobre algo ya confirmado.
    this.safePersist();
    return result;
  }

  /**
   * Guarda con reintentos (en Windows el antivirus/indexador puede bloquear el fichero un instante).
   * Si aun así falla, los datos quedan en memoria marcados como pendientes y se reintenta en la
   * siguiente escritura, periódicamente y al cerrar la aplicación.
   */
  safePersist(): boolean {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        this.persist();
        this.dirty = false;
        return true;
      } catch (e) {
        if (attempt === 3) {
          this.dirty = true;
          this.onPersistError(e);
          return false;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (attempt + 1));
      }
    }
    return false;
  }

  /** Copia binaria completa de la base de datos. */
  exportBytes(): Uint8Array {
    return this.db.export();
  }

  /** Escritura atómica a disco. */
  persist(): void {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, this.db.export());
    fs.renameSync(tmp, this.filePath);
  }

  /**
   * Sustituye la base de datos actual por otra (importación de copia de seguridad).
   * Valida antes de reemplazar: si algo falla, la base de datos actual no se toca.
   */
  replaceWith(bytes: Uint8Array): void {
    const candidate = validateBackupBytes(this.SQL, bytes);
    this.db.close();
    this.db = candidate;
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.persist();
  }

  close(): void {
    this.db.close();
  }
}

function migrate(db: Database) {
  const res = db.exec('PRAGMA user_version');
  const current = Number(res[0]?.values[0]?.[0] ?? 0);
  if (current > MIGRATIONS.length) {
    throw new Error(
      `La base de datos pertenece a una versión más reciente de la aplicación (esquema v${current}). Actualiza la aplicación.`,
    );
  }
  if (current === MIGRATIONS.length) return;
  // Procedimiento recomendado por SQLite para reconstruir tablas: claves foráneas desactivadas
  // durante la migración y comprobación de integridad referencial antes de confirmar.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let v = current; v < MIGRATIONS.length; v++) {
      db.exec('BEGIN');
      try {
        db.exec(MIGRATIONS[v]);
        if ((db.exec('PRAGMA foreign_key_check')[0]?.values ?? []).length) {
          throw new Error(
            'La base de datos contiene imputaciones que apuntan a usuarios o proyectos inexistentes; no se puede actualizar.',
          );
        }
        db.exec(`PRAGMA user_version = ${v + 1}`);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/** Abre unos bytes como base de datos, comprueba integridad y tablas, y la migra. */
export function validateBackupBytes(SQL: SqlJsStatic, bytes: Uint8Array): Database {
  const header = new TextDecoder().decode(bytes.slice(0, 15));
  if (header !== 'SQLite format 3') {
    throw new Error('El fichero seleccionado no es una copia de seguridad válida (no es SQLite).');
  }
  const db = new SQL.Database(bytes);
  try {
    const integrity = db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0];
    if (integrity !== 'ok') throw new Error('La copia de seguridad está dañada (integrity_check).');
    const tables = new Set(
      (db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((r) => String(r[0])),
    );
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (missing.length) {
      throw new Error('El fichero no es una copia de seguridad de Gestor de Horas (faltan tablas).');
    }
    db.exec('PRAGMA foreign_keys = ON;');
    try {
      migrate(db);
    } catch (e) {
      if (e instanceof Error && e.message.includes('apuntan a usuarios o proyectos inexistentes')) {
        throw new Error('La copia de seguridad contiene referencias rotas entre tablas.');
      }
      throw new Error('La copia de seguridad tiene un formato que esta versión no reconoce.');
    }
    // Comprobación de columnas: evita aceptar una base con los mismos nombres de tabla pero otro esquema.
    for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
      const have = new Set((db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? []).map((r) => String(r[1])));
      if (cols.some((c) => !have.has(c))) {
        throw new Error('El fichero no es una copia de seguridad de Gestor de Horas (estructura distinta).');
      }
    }
    if ((db.exec('PRAGMA foreign_key_check')[0]?.values ?? []).length) {
      throw new Error('La copia de seguridad contiene referencias rotas entre tablas.');
    }
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
