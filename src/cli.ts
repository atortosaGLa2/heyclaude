#!/usr/bin/env node
/**
 * heyclaude CLI
 *
 * Commands:
 *   heyclaude start    Start daemon + open tmux mascot pane
 *   heyclaude stop     Kill daemon + close tmux pane
 *   heyclaude render   Run just the render-loop (used by tmux pane internally)
 *   heyclaude status   Print current daemon state
 *   heyclaude animal   Print the detected animal for the current session
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

const HTTP_PORT  = 7337;
const PID_FILE   = join(homedir(), '.heyclaude.pid');

const args = process.argv.slice(2);
const cmd  = args[0] ?? 'start';

// ── helpers ───────────────────────────────────────────────────────────────────

async function isRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${HTTP_PORT}/status`, { signal: AbortSignal.timeout(500) });
    return res.ok;
  } catch {
    return false;
  }
}

function readPid(): number | null {
  try { return parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10); } catch { return null; }
}

function writePid(pid: number) {
  writeFileSync(PID_FILE, String(pid), 'utf8');
}

function scriptPath(name: string): string {
  const dist = join(ROOT, 'dist', `${name}.js`);
  const src  = join(ROOT, 'src',  `${name}.ts`);
  return existsSync(dist) ? dist : src;
}

function nodeRunner(script: string): { cmd: string; args: string[] } {
  const isSrc = script.endsWith('.ts');
  if (isSrc) {
    // prefer tsx
    return { cmd: 'tsx', args: [script] };
  }
  return { cmd: 'node', args: [script] };
}

// ── commands ──────────────────────────────────────────────────────────────────

async function cmdStart() {
  if (await isRunning()) {
    console.log('heyclaude is already running. Use `heyclaude stop` first.');
    process.exit(0);
  }

  // Detect environment
  const { inTmux, openPane } = await import('./tmux.js');

  // Spawn daemon detached
  const daemonScript = scriptPath('daemon');
  const runner = nodeRunner(daemonScript);
  const daemon = spawn(runner.cmd, runner.args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  daemon.unref();

  if (daemon.pid) {
    writePid(daemon.pid);
    console.log(`[heyclaude] daemon started (pid=${daemon.pid})`);
  }

  // Wait briefly for daemon to boot
  await new Promise(r => setTimeout(r, 500));

  if (inTmux()) {
    const renderScript = scriptPath('render-loop');
    const r = nodeRunner(renderScript);
    const renderCmd = `${r.cmd} "${r.args[0]}"`;
    const ok = openPane(renderCmd);
    if (ok) {
      console.log('[heyclaude] mascot pane opened in tmux ✓');
    } else {
      console.log('[heyclaude] could not open tmux pane — run `heyclaude render` manually in a split');
    }
  } else {
    console.log('[heyclaude] not in tmux — run `heyclaude render` in a side terminal to see the mascot');
  }

  // Detect + print animal
  const { detectAnimal } = await import('./session.js');
  const { animal } = detectAnimal();
  console.log(`[heyclaude] your mascot: ${animal} 🎉`);
}

async function cmdStop() {
  const { closePane } = await import('./tmux.js');
  closePane();

  const pid = readPid();
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`[heyclaude] daemon stopped (pid=${pid})`);
    } catch {
      console.log('[heyclaude] daemon was not running');
    }
  }

  // Also try HTTP kill endpoint
  try {
    await fetch(`http://localhost:${HTTP_PORT}/stop`, {
      method: 'POST',
      signal: AbortSignal.timeout(500),
    });
  } catch { /* expected */ }
}

async function cmdRender() {
  // This is run inside the tmux pane — importing it starts the loop
  await import('./render-loop.js');
}

async function cmdStatus() {
  try {
    const res  = await fetch(`http://localhost:${HTTP_PORT}/status`, { signal: AbortSignal.timeout(1000) });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch {
    console.log('[heyclaude] daemon is not running');
  }
}

async function cmdAnimal() {
  const { detectAnimal } = await import('./session.js');
  const { animal, sessionId } = detectAnimal();
  console.log(`animal: ${animal}  (session: ${sessionId.slice(0, 8)}...)`);
}

// ── dispatch ──────────────────────────────────────────────────────────────────

switch (cmd) {
  case 'start':  await cmdStart();  break;
  case 'stop':   await cmdStop();   break;
  case 'render': await cmdRender(); break;
  case 'status': await cmdStatus(); break;
  case 'animal': await cmdAnimal(); break;
  default:
    console.log(`heyclaude <start|stop|render|status|animal>`);
    process.exit(1);
}
