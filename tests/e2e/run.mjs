// Prueba end-to-end de la aplicación Electron real (requiere `npm run build` previo).
// Uso: node tests/e2e/run.mjs   (en Linux sin pantalla: xvfb-run -a node tests/e2e/run.mjs)
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-e2e-'));
const shots = path.resolve('tests/e2e/screenshots');
fs.mkdirSync(shots, { recursive: true });
const args = ['.', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])];
const results = [];

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(`  ✔ ${name} (${Date.now() - t} ms)`);
    console.log(results.at(-1));
  } catch (e) {
    console.log(`  ✘ ${name}\n${e.stack}`);
    throw e;
  }
}

async function launch() {
  const app = await electron.launch({ executablePath: electronPath, args, env: { ...process.env, GESTOR_USER_DATA: userData } });
  const main = await app.firstWindow();
  await main.waitForLoadState('domcontentloaded');
  return { app, main };
}

const winState = (app, page) =>
  app.evaluate(({ BrowserWindow }, title) => {
    return BrowserWindow.getAllWindows().map((w) => ({
      title: w.getTitle(),
      url: w.webContents.getURL(),
      visible: w.isVisible(),
      onTop: w.isAlwaysOnTop(),
      bounds: w.getBounds(),
    }));
  }, page);

const floatingPage = async (app) => {
  for (let i = 0; i < 50; i++) {
    const p = app.windows().find((w) => w.url().includes('floating.html'));
    if (p) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('No apareció la ventana del reloj flotante');
};

let { app, main } = await launch();
console.log('E2E Gestor de Horas – datos en', userData);

await step('Primer uso: pide el nombre y lo recuerda', async () => {
  await main.getByText('Bienvenido a Gestor de Horas').waitFor();
  await main.screenshot({ path: path.join(shots, '01-primer-uso.png') });
  await main.getByPlaceholder('Nombre y apellidos').fill('Alejandro Jiménez');
  await main.getByRole('button', { name: 'Empezar' }).click();
  await main.getByText('Alejandro Jiménez').first().waitFor();
});

await step('Gestión de proyectos: crear, código duplicado, desactivar', async () => {
  await main.getByRole('button', { name: 'Proyectos' }).click();
  for (const [code, name] of [
    ['AYS-001', 'Portal de clientes'],
    ['AYS-002', 'Integración SAP'],
    ['AYS-003', 'Proyecto antiguo'],
  ]) {
    await main.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await main.getByPlaceholder('p. ej. PRJ-2026-014').fill(code);
    await main.getByPlaceholder('p. ej. Portal de clientes').fill(name);
    await main.getByRole('button', { name: 'Crear proyecto' }).click();
    await main.getByRole('cell', { name, exact: true }).waitFor();
  }
  await main.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await main.getByPlaceholder('p. ej. PRJ-2026-014').fill('ays-001');
  await main.getByPlaceholder('p. ej. Portal de clientes').fill('Duplicado');
  await main.getByRole('button', { name: 'Crear proyecto' }).click();
  await main.getByText('ya está en uso').waitFor();
  await main.getByRole('button', { name: 'Cancelar' }).click();
  const row = main.getByRole('row', { name: /Proyecto antiguo/ });
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await row.getByText('Inactivo').waitFor();
  await main.screenshot({ path: path.join(shots, '02-proyectos.png') });
});

await step('Imputar horas: guardar y actualizar resumen del día', async () => {
  await main.getByRole('button', { name: 'Imputar horas' }).click();
  const projectSelect = main.locator('select').nth(1);
  const options = await projectSelect.locator('option').allTextContents();
  assert.ok(!options.some((o) => o.includes('Proyecto antiguo')), 'un proyecto inactivo no debe aparecer');
  await projectSelect.selectOption({ label: 'Portal de clientes' });
  await main.getByRole('button', { name: 'Desarrollo' }).click();
  await main.getByRole('button', { name: '4,00' }).click();
  await main.getByPlaceholder('Opcional').fill('Desarrollo del módulo de login');
  await main.getByRole('button', { name: 'Guardar imputación' }).click();
  await main.getByText('Imputación guardada').last().waitFor();
  await main.getByText('48,48 %').waitFor(); // 4 / 8,25
  // Segunda imputación usando "Resto" → completa la jornada
  await projectSelect.selectOption({ label: 'Integración SAP' });
  await main.getByRole('button', { name: 'Incidencia' }).click();
  await main.getByRole('button', { name: /Resto · 4,25/ }).click();
  await main.getByRole('button', { name: 'Guardar imputación' }).click();
  await main.getByText('Día completado').waitFor();
  await main.getByText('100,00 %').waitFor();
  await main.screenshot({ path: path.join(shots, '03-imputar-completo.png') });
});

await step('Backend impide superar el máximo diario y múltiplos de 15', async () => {
  const errs = await main.evaluate(async () => {
    const s = await window.api.settings.get();
    const [p] = await window.api.projects.list();
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const out = [];
    for (const minutes of [15, 20]) {
      try {
        await window.api.entries.create({ userId: s.currentUserId, projectId: p.id, date, minutes, workType: 'desarrollo' });
        out.push('OK');
      } catch (e) {
        out.push(e.message);
      }
    }
    return out;
  });
  assert.match(errs[0], /completa/);
  assert.match(errs[1], /múltiplos|mínimo/);
});

await step('Editar imputación teniendo en cuenta su valor anterior', async () => {
  const item = main.locator('li', { hasText: 'Integración SAP' });
  await item.hover();
  await item.getByRole('button', { name: 'Editar' }).click();
  await main.getByText('Editando la imputación').waitFor();
  await main.getByRole('button', { name: 'Restar 15 minutos' }).click();
  await main.getByRole('button', { name: 'Guardar cambios' }).click();
  await main.getByText('Cambios guardados').last().waitFor();
  await main.getByText('Pendiente', { exact: true }).waitFor();
});

await step('Histórico: tabla, filtros, total y día anterior', async () => {
  // Imputación en un día anterior
  await main.getByRole('button', { name: 'Día anterior' }).click();
  await main.locator('select').nth(1).selectOption({ label: 'Portal de clientes' });
  await main.getByRole('button', { name: 'Mantenimiento' }).click();
  await main.getByRole('button', { name: '2,00' }).click();
  await main.getByRole('button', { name: 'Guardar imputación' }).click();
  await main.getByText('Imputación guardada').last().waitFor();

  await main.getByRole('button', { name: 'Histórico' }).click();
  await main.getByText('3 registro(s)').waitFor();
  await main.getByText('10,00 h').waitFor();
  await main.screenshot({ path: path.join(shots, '04-historico.png') });
  await main.getByPlaceholder('Buscar proyecto…').fill('SAP');
  await main.getByText('1 registro(s)').waitFor();
  await main.getByRole('button', { name: 'Limpiar filtros' }).click();
  await main.getByLabel('Filtrar por tipo').selectOption('mantenimiento');
  await main.getByText('2,00 h').first().waitFor();
  await main.getByRole('button', { name: 'Limpiar filtros' }).click();
  // Eliminar con confirmación
  const row = main.getByRole('row', { name: /Mantenimiento/ });
  await row.hover();
  await row.getByRole('button', { name: 'Eliminar' }).click();
  await main.getByRole('dialog', { name: 'Eliminar imputación' }).getByRole('button', { name: 'Eliminar' }).click();
  await main.getByText('2 registro(s)').waitFor();
});

await step('Configuración visible y recordatorio cada 1 minuto', async () => {
  await main.getByRole('button', { name: 'Configuración' }).click();
  await main.getByText('Horas máximas diarias').waitFor();
  await main.screenshot({ path: path.join(shots, '05-configuracion.png'), fullPage: true });
  // Intervalo personalizado de 1 minuto para probar el temporizador real
  await main.evaluate(() => window.api.settings.update({ reminderIntervalMinutes: 1, skipRemindersWhenComplete: false }));
});

let floating;
await step('Minimizar a reloj flotante: ventana independiente, siempre encima', async () => {
  await main.getByRole('button', { name: 'Imputar horas' }).click();
  await main.getByRole('button', { name: 'Minimizar a reloj flotante' }).click();
  floating = await floatingPage(app);
  await floating.getByTestId('floating-clock').waitFor();
  await new Promise((r) => setTimeout(r, 400));
  const ws = await winState(app);
  const mainW = ws.find((w) => w.url.includes('index.html'));
  const floatW = ws.find((w) => w.url.includes('floating.html'));
  assert.equal(mainW.visible, false, 'la ventana principal debe ocultarse');
  assert.equal(floatW.visible, true, 'el reloj debe verse');
  assert.equal(floatW.onTop, true, 'el reloj debe estar siempre encima');
  assert.ok(floatW.bounds.width <= 100 && floatW.bounds.height <= 100, 'el reloj debe ser pequeño');
});

await step('El recordatorio salta por temporizador con la ventana oculta (espera real ~1 min)', async () => {
  await floating.locator('.animate-ping').waitFor({ timeout: 75_000 });
  const html = await floating.content();
  assert.ok(html.includes('animate-ping'));
  await floating.screenshot({ path: path.join(shots, '06-reloj-aviso.png') });
});

await step('Arrastrar el reloj y recordar posición', async () => {
  const before = (await winState(app)).find((w) => w.url.includes('floating.html')).bounds;
  await app.evaluate(({ ipcMain }) => {
    // Simula la secuencia de arrastre que envía el renderer.
    ipcMain.emit('floating:dragStart', { senderFrame: { url: 'file://x' } });
    ipcMain.emit('floating:dragMove', { senderFrame: { url: 'file://x' } }, -120, -80);
    ipcMain.emit('floating:dragEnd', { senderFrame: { url: 'file://x' } });
  });
  const after = (await winState(app)).find((w) => w.url.includes('floating.html')).bounds;
  assert.equal(after.x, before.x - 120);
  assert.equal(after.y, before.y - 80);
  const s = await main.evaluate(() => window.api.settings.get());
  assert.equal(s.floatingPosition, 'custom');
  assert.equal(s.floatingX, after.x);
});

await step('Clic en el reloj restaura la ventana de imputación', async () => {
  await floating.getByTestId('floating-clock').click();
  await new Promise((r) => setTimeout(r, 500));
  const ws = await winState(app);
  assert.equal(ws.find((w) => w.url.includes('index.html')).visible, true);
  assert.equal(ws.find((w) => w.url.includes('floating.html')).visible, false);
});

await step('Minimizar la ventana muestra el reloj y cerrar la oculta en bandeja', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index'))?.minimize());
  await new Promise((r) => setTimeout(r, 500));
  let ws = await winState(app);
  assert.equal(ws.find((w) => w.url.includes('floating.html')).visible, true);
  await main.evaluate(() => window.api.reminders.status()); // la app sigue viva
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index'));
    w.restore();
    w.show();
  });
  await new Promise((r) => setTimeout(r, 300));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index'))?.close());
  await new Promise((r) => setTimeout(r, 300));
  ws = await winState(app);
  assert.equal(ws.find((w) => w.url.includes('index.html')).visible, false, 'cerrar oculta en la bandeja');
  assert.equal(ws.find((w) => w.url.includes('floating.html')).visible, true);
});

await step('Persistencia tras cerrar y volver a abrir la aplicación', async () => {
  await app.evaluate(({ app }) => app.quit());
  await new Promise((r) => setTimeout(r, 800));
  ({ app, main } = await launch());
  await main.getByText('Alejandro Jiménez').first().waitFor();
  const count = await main.locator('text=Bienvenido a Gestor de Horas').count();
  assert.equal(count, 0, 'no debe volver a pedir el nombre');
  const h = await main.evaluate(() => window.api.entries.history({}));
  assert.equal(h.rows.length, 2);
  const s = await main.evaluate(() => window.api.settings.get());
  assert.equal(s.reminderIntervalMinutes, 1);
  assert.equal(s.floatingPosition, 'custom');
  assert.ok(fs.existsSync(path.join(userData, 'gestor-horas.sqlite')));
  assert.ok(fs.existsSync(path.join(userData, 'copias-seguridad')), 'copia automática diaria');
  await main.screenshot({ path: path.join(shots, '07-tras-reinicio.png') });
});

await app.evaluate(({ app }) => app.quit());
console.log(`\nE2E OK – ${results.length} pasos superados. Capturas en ${shots}`);
process.exit(0);
