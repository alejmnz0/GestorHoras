/**
 * Exportación del histórico a CSV y Excel (.xlsx).
 */
import * as XLSX from 'xlsx';
import { formatDate, formatHours, workTypeLabel } from '../shared/rules';
import type { TimeEntry } from '../shared/types';

const HEADERS = ['Fecha', 'Usuario', 'Proyecto', 'Código proyecto', 'Tipo', 'Horas', 'Descripción'];

/** CSV con separador ";" y coma decimal, que es lo que Excel en español abre directamente. */
export function toCsv(rows: TimeEntry[]): string {
  const esc = (raw: string) => {
    // Evita que Excel interprete como fórmula un texto que empiece por = + - @
    const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [HEADERS.join(';')];
  for (const r of rows) {
    lines.push(
      [
        formatDate(r.date),
        r.userName,
        r.projectName,
        r.projectCode,
        workTypeLabel(r.workType),
        formatHours(r.minutes),
        r.description,
      ]
        .map(esc)
        .join(';'),
    );
  }
  // BOM para que Excel detecte UTF-8 (tildes y eñes).
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Número de serie de Excel para una fecha YYYY-MM-DD (sin problemas de zona horaria). */
export function excelSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

export function toXlsx(rows: TimeEntry[], totalMinutes: number): Uint8Array {
  const aoa: (string | number)[][] = [HEADERS];
  for (const r of rows) {
    aoa.push([
      excelSerial(r.date),
      r.userName,
      r.projectName,
      r.projectCode,
      workTypeLabel(r.workType),
      r.minutes / 60,
      r.description,
    ]);
  }
  aoa.push([]);
  aoa.push(['', '', '', '', 'TOTAL', totalMinutes / 60, '']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Formatos: fecha DD/MM/YYYY y horas con dos decimales.
  for (let i = 1; i <= rows.length; i++) {
    const dateCell = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (dateCell) {
      dateCell.t = 'n';
      dateCell.z = 'dd/mm/yyyy';
    }
    const h = ws[XLSX.utils.encode_cell({ r: i, c: 5 })];
    if (h) h.z = '0.00';
  }
  const totalCell = ws[XLSX.utils.encode_cell({ r: rows.length + 2, c: 5 })];
  if (totalCell) totalCell.z = '0.00';
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 32 }, { wch: 16 }, { wch: 15 }, { wch: 8 }, { wch: 60 }];
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: 6 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Imputaciones');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}
