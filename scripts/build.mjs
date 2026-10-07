import { chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/guyu.mjs',
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: true,
});
await chmod(new URL('../dist/guyu.mjs', import.meta.url), 0o755);
