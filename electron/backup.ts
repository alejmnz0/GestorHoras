/**
 * Copias de seguridad: exportación/importación manual y copias automáticas diarias.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Store } from './db';

export const AUTO_BACKUPS_TO_KEEP = 10;

export function exportBackup(store: Store, destination: string): void {
  fs.writeFileSync(destination, store.exportBytes());
}

/**
 * Importa una copia. Antes de sustituir los datos guarda una copia de seguridad de los actuales
 * en la carpeta de copias, por si el usuario se equivoca de fichero.
 */
export function importBackup(store: Store, source: string, backupDir: string): string {
  const bytes = new Uint8Array(fs.readFileSync(source));
  fs.mkdirSync(backupDir, { recursive: true });
  const safety = path.join(backupDir, `antes-de-importar-${stamp()}.sqlite`);
  fs.writeFileSync(safety, store.exportBytes());
  store.replaceWith(bytes); // valida: si no es correcta lanza error sin tocar los datos
  const pre = fs.readdirSync(backupDir).filter((f) => f.startsWith('antes-de-importar-')).sort();
  for (const old of pre.slice(0, Math.max(0, pre.length - 5))) fs.rmSync(path.join(backupDir, old), { force: true });
  return safety;
}

/** Una copia automática al día (la primera vez que se abre la app), conservando las últimas N. */
export function autoBackup(dbPath: string, backupDir: string, today: string): string | null {
  if (!fs.existsSync(dbPath)) return null;
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `auto-${today}.sqlite`);
  if (!fs.existsSync(target)) fs.copyFileSync(dbPath, target);
  const autos = fs
    .readdirSync(backupDir)
    .filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
    .sort();
  for (const old of autos.slice(0, Math.max(0, autos.length - AUTO_BACKUPS_TO_KEEP))) {
    fs.rmSync(path.join(backupDir, old), { force: true });
  }
  return target;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
