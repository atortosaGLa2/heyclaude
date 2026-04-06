#!/usr/bin/env node
/**
 * heyclaude CLI
 *
 * Commands:
 *   heyclaude start [--theme T] [--animal A] [--web] [--position P]
 *   heyclaude stop              Kill daemon + close mascot pane
 *   heyclaude render            Run just the render-loop (used by pane internally)
 *   heyclaude status            Print current daemon state
 *   heyclaude animal            Print the detected animal for the current session
 *   heyclaude animals           List all available sprites with emoji
 *   heyclaude preview <name>    Render one frame of a sprite to stdout
 *   heyclaude demo              Cycle through all animation states with 2s delay
 *   heyclaude config show       Display current config
 *   heyclaude config set K V    Set a config key
 *   heyclaude config reset      Reset to defaults
 *   heyclaude --help / -h       Show full usage
 *   heyclaude --version / -v    Show version
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

const PID_FILE   = join(homedir(), '.heyclaude.pid');

// ── arg parsing ──────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

/** Parse --key value and --flag style arguments from argv */
function parseFlags(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++; // consume the value
      } else {
        flags[key] = true;
      }
    } else if (arg === '-h') {
      flags['help'] = true;
    } else if (arg === '-v') {
      flags['version'] = true;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

const { positional, flags } = parseFlags(rawArgs);

// Handle top-level --help and --version before command dispatch
if (flags['help']) {
  printHelp();
  process.exit(0);
}

if (flags['version']) {
  printVersion();
  process.exit(0);
}

const cmd    = positional[0] ?? 'start';
const subCmd = positional[1];

// ── helpers ───────────────────────────────────────────────────────────────────

function getVersion(): string {
  const pkgPath = join(ROOT, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function printVersion(): void {
  console.log(`heyclaude v${getVersion()}`);
}

function printHelp(): void {
  const help = `
heyclaude v${getVersion()} - Animated Claude Code mascot

Usage:
  heyclaude <command> [options]

Commands:
  start                Start daemon + open mascot pane
  popup                Launch popup mascot (starts daemon if needed)
  popup list           List all available mascots
  popup stop           Close the popup
  stop                 Kill daemon + close mascot pane
  render               Run the render loop (used internally by pane)
  status               Show daemon state
  animal               Show current session's animal
  animals              List all available sprites with emoji
  preview <name>       Render one frame of a sprite to stdout
  demo                 Cycle through all animation states (2s each)
  config show          Display current config as JSON
  config set <K> <V>   Set a config key
  config reset         Reset config to defaults

Options for 'start':
  --theme <name>       Theme name (claude, ocean, forest, neon, mono)
  --animal <name>      Override animal (e.g. cat, owl, dragon)
  --mode <mode>        Display mode: terminal (default), popup (Electron), web (browser)
  --position <pos>     Pane position (left, right)

Options for 'popup':
  --animal <name>      Choose mascot (e.g. cat, owl, dragon, fox, flamingo)

  Web UI is always available at http://localhost:7337 when daemon is running.

Global options:
  --help, -h           Show this help
  --version, -v        Show version
`.trim();
  console.log(help);
}

async function isRunning(): Promise<boolean> {
  const { loadConfig } = await import('./config.js');
  const config = loadConfig();
  try {
    const res = await fetch(`http://localhost:${config.daemonPort}/status`, { signal: AbortSignal.timeout(500) });
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
    return { cmd: 'tsx', args: [script] };
  }
  return { cmd: 'node', args: [script] };
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── commands ──────────────────────────────────────────────────────────────────

async function cmdStart() {
  if (await isRunning()) {
    console.log('heyclaude is already running. Use `heyclaude stop` first.');
    process.exit(0);
  }

  // Build config overrides from CLI flags
  const cliOverrides: Record<string, string> = {};
  if (typeof flags['theme'] === 'string')    cliOverrides.theme    = flags['theme'];
  if (typeof flags['animal'] === 'string')   cliOverrides.animal   = flags['animal'];
  if (typeof flags['position'] === 'string') cliOverrides.position = flags['position'];

  const { loadConfig } = await import('./config.js');
  const config = loadConfig(cliOverrides);

  // Spawn daemon detached (serves API + web UI on same port)
  const daemonScript = scriptPath('daemon');
  const runner = nodeRunner(daemonScript);
  const daemon = spawn(runner.cmd, runner.args, {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      HEYCLAUDE_DAEMON_PORT: String(config.daemonPort),
      HEYCLAUDE_WS_PORT: String(config.wsPort),
    },
  });
  daemon.unref();

  if (daemon.pid) {
    writePid(daemon.pid);
    console.log(`[heyclaude] daemon started (pid=${daemon.pid})`);
  }

  // Wait briefly for daemon to boot
  await sleep(500);

  // Select display mode
  const mode = (typeof flags['mode'] === 'string' ? flags['mode'] : 'auto') as 'auto' | 'terminal' | 'popup' | 'web';

  if (mode === 'web') {
    // Web-only mode: just open the browser
    const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(open, [`http://localhost:${config.daemonPort}`], { detached: true, stdio: 'ignore' }).unref();
    console.log(`[heyclaude] opened web UI in browser`);
  } else {
    const { selectAdapter } = await import('./adapters/index.js');
    const adapter = selectAdapter(mode === 'auto' ? undefined : mode);

    // StandaloneAdapter in WSL opens the browser — pass the web URL instead of a render command
    const isWSL = process.platform === 'linux' &&
      (() => { try { return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft'); } catch { return false; } })();
    const openArg = (adapter.name === 'standalone' && isWSL)
      ? `http://localhost:${config.daemonPort}`
      : (() => { const r = nodeRunner(scriptPath('render-loop')); return `${r.cmd} "${r.args[0]}"`; })();

    const ok = adapter.open(openArg);
    if (ok) {
      console.log(`[heyclaude] mascot opened via ${adapter.name}`);
    }
  }

  // Detect + print animal
  const { detectAnimal } = await import('./session.js');
  const { animal } = detectAnimal();
  console.log(`[heyclaude] your mascot: ${animal}`);
  console.log(`[heyclaude] web UI: http://localhost:${config.daemonPort}`);
}

async function cmdStop() {
  const { selectAdapter } = await import('./adapters/index.js');
  const adapter = selectAdapter();
  adapter.close();

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
  const { loadConfig } = await import('./config.js');
  const config = loadConfig();
  try {
    await fetch(`http://localhost:${config.daemonPort}/stop`, {
      method: 'POST',
      signal: AbortSignal.timeout(500),
    });
  } catch { /* expected */ }
}

async function cmdRender() {
  // This is run inside the tmux pane -- importing it starts the loop
  await import('./render-loop.js');
}

async function cmdStatus() {
  const { loadConfig } = await import('./config.js');
  const config = loadConfig();
  try {
    const res  = await fetch(`http://localhost:${config.daemonPort}/status`, { signal: AbortSignal.timeout(1000) });
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

async function cmdAnimals() {
  const { SUPPORTED_ANIMALS, getSprite } = await import('./sprites/index.js');

  console.log('Available sprites:\n');
  const seen = new Set<string>();
  for (const name of SUPPORTED_ANIMALS) {
    const sprite = getSprite(name);
    // Skip aliases that resolve to the same sprite (e.g. rabbit -> bunny)
    const key = sprite.name;
    if (seen.has(key)) {
      console.log(`  ${name.padEnd(12)} -> ${key}`);
      continue;
    }
    seen.add(key);
    console.log(`  ${sprite.emoji}  ${name.padEnd(12)} ${sprite.name}`);
  }
  console.log(`\n${seen.size} sprites available`);
}

async function cmdPreview(name: string | undefined) {
  if (!name) {
    console.error('Usage: heyclaude preview <sprite-name>');
    process.exit(1);
  }

  const { getSprite } = await import('./sprites/index.js');
  const { renderUI } = await import('./renderer.js');

  const sprite = getSprite(name);
  const output = renderUI(sprite, 'idle', 0);
  process.stdout.write(output);
}

async function cmdDemo() {
  const { getSprite } = await import('./sprites/index.js');
  const { renderUI } = await import('./renderer.js');
  const { detectAnimal } = await import('./session.js');

  const { animal } = detectAnimal();
  const sprite = getSprite(animal);

  const states: string[] = [
    'idle', 'thinking', 'coding', 'reading', 'searching',
    'browsing', 'executing', 'planning', 'waiting',
    'success', 'error', 'mcp', 'skill', 'sleeping', 'greeting',
  ];

  for (const state of states) {
    const output = renderUI(sprite, state as any, 0);
    process.stdout.write(output);
    console.log(`\n  State: ${state}`);
    await sleep(2000);
  }

  console.log('\n[heyclaude] demo complete');
}

async function cmdConfigShow() {
  const { loadConfig } = await import('./config.js');
  const config = loadConfig();
  console.log(JSON.stringify(config, null, 2));
}

async function cmdConfigSet(key: string | undefined, value: string | undefined) {
  if (!key || value === undefined) {
    console.error('Usage: heyclaude config set <key> <value>');
    process.exit(1);
  }

  const { saveConfig } = await import('./config.js');

  // Coerce value types for known numeric/boolean keys
  let coerced: string | number | boolean = value;
  if (['width', 'daemonPort', 'wsPort', 'webPort'].includes(key)) {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) coerced = n;
  } else if (key === 'particles') {
    coerced = value === 'true' || value === '1';
  }

  saveConfig({ [key]: coerced });
  console.log(`[heyclaude] config: ${key} = ${JSON.stringify(coerced)}`);
}

async function cmdConfigReset() {
  const { resetConfig } = await import('./config.js');
  resetConfig();
  console.log('[heyclaude] config reset to defaults');
}

// ── popup shortcut ───────────────────────────────────────────────────────────

async function cmdPopup() {
  const sub = subCmd ?? 'start';

  if (sub === 'list' || sub === 'animals') {
    const { SUPPORTED_ANIMALS, getSprite } = await import('./sprites/index.js');
    const seen = new Set<string>();
    const animals: { emoji: string; name: string }[] = [];
    for (const name of SUPPORTED_ANIMALS) {
      const sprite = getSprite(name);
      if (seen.has(sprite.name)) continue;
      seen.add(sprite.name);
      animals.push({ emoji: sprite.emoji, name: sprite.name });
    }
    console.log(`\n  Available mascots (${animals.length}):\n`);
    // Print in columns
    const cols = 4;
    for (let i = 0; i < animals.length; i += cols) {
      const row = animals.slice(i, i + cols)
        .map(a => `  ${a.emoji}  ${a.name.padEnd(12)}`)
        .join('');
      console.log(row);
    }
    console.log(`\n  Use: heyclaude popup --animal <name>\n`);
    return;
  }

  if (sub === 'stop' || sub === 'kill') {
    // Kill any running Electron popup
    try {
      const { execSync } = await import('child_process');
      execSync('pkill -f "Electron.*main.cjs"', { stdio: 'ignore' });
      console.log('[heyclaude] popup closed');
    } catch {
      console.log('[heyclaude] no popup running');
    }
    return;
  }

  // Start: ensure daemon is running, then launch popup
  if (!(await isRunning())) {
    // Start daemon first
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const daemonScript = scriptPath('daemon');
    const runner = nodeRunner(daemonScript);
    const daemon = spawn(runner.cmd, runner.args, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        HEYCLAUDE_DAEMON_PORT: String(config.daemonPort),
        HEYCLAUDE_WS_PORT: String(config.wsPort),
      },
    });
    daemon.unref();
    if (daemon.pid) {
      writePid(daemon.pid);
      console.log(`[heyclaude] daemon started (pid=${daemon.pid})`);
    }
    await sleep(500);
  }

  // Switch animal if --animal flag provided
  if (typeof flags['animal'] === 'string') {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    try {
      await fetch(`http://localhost:${config.daemonPort}/animal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animal: flags['animal'] }),
        signal: AbortSignal.timeout(1000),
      });
    } catch { /* daemon might not be ready yet */ }
  }

  // Launch Electron popup
  const { selectAdapter } = await import('./adapters/index.js');
  const adapter = selectAdapter('popup');
  const ok = adapter.open('');
  if (ok) {
    const animal = typeof flags['animal'] === 'string' ? flags['animal'] : (await import('./session.js')).detectAnimal().animal;
    console.log(`[heyclaude] popup launched — ${animal}`);
  } else {
    console.error('[heyclaude] failed to launch popup. Is electron installed?');
  }
}

// ── dispatch ──────────────────────────────────────────────────────────────────

switch (cmd) {
  case 'start':   await cmdStart();                       break;
  case 'popup':   await cmdPopup();                       break;
  case 'stop':    await cmdStop();                        break;
  case 'render':  await cmdRender();                      break;
  case 'status':  await cmdStatus();                      break;
  case 'animal':  await cmdAnimal();                      break;
  case 'animals': await cmdAnimals();                     break;
  case 'preview': await cmdPreview(subCmd);               break;
  case 'demo':    await cmdDemo();                        break;
  case 'config':
    switch (subCmd) {
      case 'show':  await cmdConfigShow();                break;
      case 'set':   await cmdConfigSet(positional[2], positional[3]); break;
      case 'reset': await cmdConfigReset();               break;
      default:
        console.log('Usage: heyclaude config <show|set|reset>');
        process.exit(1);
    }
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    printHelp();
    process.exit(1);
}
