// Compila el proceso principal y el preload de Electron con esbuild (CommonJS).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const watch = process.argv.includes('--dev');
const outdir = 'dist-electron';
fs.rmSync(outdir, { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  logLevel: 'warning',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  // sql.js con el WebAssembly embebido: no hay ficheros .wasm que localizar en el instalador.
  alias: { 'sql.js': path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm-inline.js') },
};

await build({ ...common, entryPoints: { main: 'electron/main.ts' }, outdir });
await build({ ...common, entryPoints: { preload: 'electron/preload.ts' }, outdir });

fs.mkdirSync(path.join(outdir, 'assets'), { recursive: true });
for (const f of ['icon.png', 'tray.png', 'tray.ico']) {
  fs.copyFileSync(path.join('build', f), path.join(outdir, 'assets', f));
}
console.log('Electron compilado en', outdir);
