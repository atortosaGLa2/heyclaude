#!/usr/bin/env node
/**
 * heyclaude entry point
 * Resolves to src/cli.ts (tsx) or dist/cli.js (compiled)
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const distCli   = join(root, 'dist', 'cli.js');
const srcCli    = join(root, 'src',  'cli.ts');

if (existsSync(distCli)) {
  // Production: run compiled JS
  const { default: _ } = await import(distCli);
} else if (existsSync(srcCli)) {
  // Development: run via tsx
  const tsx = spawn('tsx', [srcCli, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  tsx.on('exit', code => process.exit(code ?? 0));
} else {
  console.error('[heyclaude] Could not find cli.js or cli.ts. Run `npm run build` first.');
  process.exit(1);
}
