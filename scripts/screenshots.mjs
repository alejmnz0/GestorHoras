// Genera las capturas del README (docs/screenshots) con datos de demostración ficticios.
// Uso: npm run build && node scripts/screenshots.mjs   (Linux sin pantalla: xvfb-run -a node scripts/screenshots.mjs)
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = path.resolve('docs/screenshots');
fs.mkdirSync(out, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-shots-'));
const args = ['.', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])];
const app = await electron.launch({ executablePath: electronPath, args, env: { ...process.env, GESTOR_USER_DATA: userData } });
const main = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.setSize(1280, 800);
  w.center();
});
await main.getByPlaceholder('Nombre y apellidos').fill('Usuario Demo');
await main.getByRole('button', { name: 'Empezar' }).click();
await main.getByText('Usuario Demo').first().waitFor();

// Datos ficticios: proyectos y una semana de imputaciones.
await main.evaluate(async () => {
  const api = window.api;
  const s = await api.settings.get();
  const projects = [
    ['DEMO-101', 'Portal de clientes'],
    ['DEMO-204', 'Integración ERP'],
    ['DEMO-310', 'App móvil de pedidos'],
    ['DEMO-415', 'Soporte interno'],
    ['DEMO-099', 'Migración legacy'],
  ];
  const ids = [];
  for (const [code, name] of projects) ids.push((await api.projects.create({ code, name })).id);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plan = [
    [[ids[0], 240, 'desarrollo', 'Nuevo flujo de alta de clientes'], [ids[1], 180, 'incidencia', 'Error en sincronización de facturas'], [ids[3], 75, 'mantenimiento', 'Actualización de dependencias']],
    [[ids[2], 300, 'desarrollo', 'Pantalla de carrito'], [ids[0], 195, 'mantenimiento', 'Revisión de rendimiento']],
    [[ids[1], 255, 'desarrollo', 'Conector de pedidos'], [ids[3], 120, 'incidencia', 'Acceso VPN de un compañero'], [ids[4], 120, 'mantenimiento', 'Documentación de la migración']],
    [[ids[0], 495, 'desarrollo', 'Refactor del módulo de pagos']],
  ];
  const today = new Date();
  for (let i = 0; i < plan.length; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (plan.length - i));
    for (const [projectId, minutes, workType, description] of plan[i]) {
      await api.entries.create({ userId: s.currentUserId, projectId, date: iso(d), minutes, workType, description });
    }
  }
  await api.projects.setActive(ids[4], false);
  // Proyectos especiales y unas vacaciones la semana anterior.
  await api.projects.create({ code: 'VACACIONES', name: 'Vacaciones', kind: 'vacation' });
  await api.projects.create({ code: 'BAJA', name: 'Baja laboral', kind: 'sick_leave' });
  const vFrom = new Date(today);
  vFrom.setDate(today.getDate() - 9);
  const vTo = new Date(today);
  vTo.setDate(today.getDate() - 8);
  await api.entries.registerAbsence({ userId: s.currentUserId, kind: 'vacation', dateFrom: iso(vFrom), dateTo: iso(vTo), minutesPerDay: null, description: 'Puente' });
  await api.entries.create({ userId: s.currentUserId, projectId: ids[0], date: iso(today), minutes: 210, workType: 'desarrollo', description: 'Validaciones del formulario de registro' });
  await api.entries.create({ userId: s.currentUserId, projectId: ids[1], date: iso(today), minutes: 120, workType: 'incidencia', description: 'Pedido duplicado en el ERP' });
});

const settle = async () => {
  await main.waitForFunction(() => !document.querySelector('[role="status"]'), null, { timeout: 15_000 });
  await main.waitForTimeout(400);
};
const shot = async (name) => {
  await settle();
  await main.screenshot({ path: path.join(out, name) });
  console.log('✔', name);
};

await main.getByRole('button', { name: 'Imputar horas' }).click();
await main.locator('select').nth(1).selectOption({ label: 'App móvil de pedidos' });
await main.getByRole('button', { name: 'Desarrollo', exact: true }).click();
await main.getByPlaceholder('Opcional').fill('Integración con la pasarela de pago');
await shot('imputar.png');

await main.getByRole('button', { name: 'Histórico' }).click();
await main.getByText('registro(s)').first().waitFor();
await shot('historico.png');

await main.getByRole('tab', { name: 'Estadísticas' }).click();
await main.getByText('Horas por proyecto').waitFor();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 980));
await main.waitForTimeout(500);
await shot('estadisticas.png');
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800));
await main.getByRole('tab', { name: 'Registros' }).click();

await main.getByRole('button', { name: 'Proyectos' }).click();
await main.getByRole('cell', { name: 'Integración ERP' }).waitFor();
await shot('proyectos.png');

// Duplicar una tarea
await main.getByRole('button', { name: 'Imputar horas', exact: true }).click();
const item = main.locator('li', { hasText: 'Integración ERP' }).first();
await item.hover();
await item.getByRole('button', { name: 'Duplicar como nueva' }).click();
await main.locator('select').nth(1).selectOption({ label: 'Soporte interno' });
await main.locator('li', { hasText: 'Integración ERP' }).first().hover();
await shot('duplicar.png');
await main.getByRole('button', { name: 'Descartar' }).click();

// Registrar ausencia
await main.getByRole('button', { name: 'Registrar ausencia' }).click();
const dlg = main.getByRole('dialog', { name: 'Registrar ausencia' });
const d0 = new Date();
d0.setDate(d0.getDate() + ((8 - d0.getDay()) % 7 || 7));
const d1 = new Date(d0);
d1.setDate(d0.getDate() + 11);
const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
await dlg.locator('input[type="date"]').nth(0).fill(isoD(d0));
await dlg.locator('input[type="date"]').nth(1).fill(isoD(d1));
await dlg.getByPlaceholder('p. ej. Vacaciones de verano').fill('Vacaciones de Navidad');
await shot('ausencia.png');
await dlg.getByRole('button', { name: 'Cancelar' }).click();

await main.getByRole('button', { name: 'Configuración' }).click();
await main.getByText('Horas máximas diarias').waitFor();
await shot('configuracion.png');

// Modo noche
await main.evaluate(() => window.api.settings.update({ theme: 'dark' }));
await main.waitForFunction(() => document.documentElement.classList.contains('dark'));
await shot('modo-noche.png');
await main.getByRole('button', { name: 'Histórico' }).click();
await main.getByRole('tab', { name: 'Estadísticas' }).click();
await main.getByText('Horas por proyecto').waitFor();
await shot('modo-noche-estadisticas.png');
await main.evaluate(() => window.api.settings.update({ theme: 'light' }));
await main.getByRole('button', { name: 'Imputar horas', exact: true }).click();

// Reloj flotante en reposo y avisando (fondo de escritorio simulado con una página clara).
await main.getByRole('button', { name: 'Imputar horas' }).click();
await main.getByRole('button', { name: 'Minimizar a reloj flotante' }).click();
let floating;
for (let i = 0; i < 50 && !floating; i++) {
  floating = app.windows().find((w) => w.url().includes('floating.html'));
  if (!floating) await new Promise((r) => setTimeout(r, 100));
}
await floating.getByTestId('floating-clock').waitFor();
await floating.waitForTimeout(800);
await floating.screenshot({ path: path.join(out, 'reloj.png') });
await main.evaluate(() => window.api.reminders.test());
await floating.locator('.animate-ping').waitFor();
await floating.waitForTimeout(1200);
await floating.screenshot({ path: path.join(out, 'reloj-aviso.png') });
console.log('✔ reloj.png / reloj-aviso.png');

await app.evaluate(({ app }) => app.quit());
fs.rmSync(userData, { recursive: true, force: true });
