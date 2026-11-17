/**
 * Registro de errores sencillo en fichero (con rotación por tamaño).
 * Ubicación: %APPDATA%/Gestor de Horas/logs/app.log
 */
import fs from 'node:fs';
import path from 'node:path';

const MAX_SIZE = 1024 * 1024; // 1 MB
let logFile: string | null = null;

export function initLogger(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, 'app.log');
  return logFile;
}

function write(level: string, msg: string, err?: unknown) {
  const detail = err instanceof Error ? ` | ${err.stack ?? err.message}` : err !== undefined ? ` | ${String(err)}` : '';
  const line = `[${new Date().toISOString()}] ${level} ${msg}${detail}\n`;
  if (level === 'ERROR') console.error(line.trim());
  else console.log(line.trim());
  if (!logFile) return;
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_SIZE) {
      fs.renameSync(logFile, logFile.replace(/\.log$/, '.old.log'));
    }
    fs.appendFileSync(logFile, line);
  } catch {
    /* nunca fallar por no poder escribir el log */
  }
}

export const log = {
  info: (msg: string) => write('INFO', msg),
  warn: (msg: string, err?: unknown) => write('WARN', msg, err),
  error: (msg: string, err?: unknown) => write('ERROR', msg, err),
};
