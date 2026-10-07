import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
await build({ entryPoints: ['src/index.ts'], bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: 'dist/guyu.mjs', banner: { js: '#!/usr/bin/env node' } });
await chmod('dist/guyu.mjs', 0o755);
