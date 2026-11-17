import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { excelSerial, toCsv, toXlsx } from '../electron/exporter';
import {
  addDays,
  formatDate,
  formatHours,
  formatHoursLong,
  formatPercent,
  isValidIsoDate,
  percentOf,
  todayIso,
} from '../shared/rules';
import type { TimeEntry } from '../shared/types';

describe('Formato y utilidades', () => {
  it('formatea horas en español con dos decimales', () => {
    expect(formatHours(495)).toBe('8,25');
    expect(formatHours(15)).toBe('0,25');
    expect(formatHoursLong(90)).toBe('1 h 30 min');
    expect(formatPercent(percentOf(330, 495))).toBe('66,67 %');
  });

  it('muestra fechas como DD/MM/YYYY', () => {
    expect(formatDate('2026-11-05')).toBe('05/11/2026');
  });

  it('valida fechas reales', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('16/11/2026')).toBe(false);
  });

  it('usa la fecha local y suma días correctamente', () => {
    expect(todayIso(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

const rows: TimeEntry[] = [
  {
    id: 1,
    userId: 1,
    userName: 'Alejandro',
    projectId: 1,
    projectCode: 'P-1',
    projectName: 'Portal; "clientes"',
    projectActive: true,
    projectKind: 'normal',
    date: '2026-11-16',
    minutes: 135,
    workType: 'incidencia',
    description: 'Línea 1\nLínea 2',
    createdAt: '',
    updatedAt: '',
  },
];

describe('Exportación', () => {
  it('genera CSV compatible con Excel en español', () => {
    const csv = toCsv(rows);
    expect(csv.startsWith('﻿Fecha;Usuario;Proyecto;Código proyecto;Tipo;Horas;Descripción')).toBe(true);
    expect(csv).toContain('16/11/2026;Alejandro;"Portal; ""clientes""";P-1;Incidencia;2,25;"Línea 1\nLínea 2"');
  });

  it('genera un XLSX legible con fechas y horas numéricas', () => {
    const buf = toXlsx(rows, 135);
    const wb = XLSX.read(buf, { type: 'buffer', cellNF: true });
    const ws = wb.Sheets['Imputaciones'];
    expect(ws['A1'].v).toBe('Fecha');
    expect(ws['A2'].v).toBe(excelSerial('2026-11-16'));
    expect(ws['A2'].z).toBe('dd/mm/yyyy');
    expect(ws['F2'].v).toBe(2.25);
    expect(ws['F4'].v).toBe(2.25);
    expect(excelSerial('1900-03-01')).toBe(61);
  });
});

describe('Seguridad de exportación', () => {
  it('neutraliza fórmulas en el CSV', () => {
    const csv = toCsv([{ ...rows[0], description: '=HYPERLINK("x")', projectName: 'P' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
