// Arranca Vite en modo desarrollo y lanza Electron apuntando al servidor.
import { createServer } from 'vite';
import { spawn, execFileSync } from 'node:child_process';
import electronPath from 'electron';

execFileSync(process.execPath, ['scripts/build-electron.mjs', '--dev'], { stdio: 'inherit' });
const server = await createServer();
await server.listen();
const url = `http://localhost:${server.config.server.port}`;
const extra = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
const child = spawn(electronPath, ['.', ...extra], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
