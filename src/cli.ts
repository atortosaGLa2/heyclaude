#!/usr/bin/env node
/**
 * heyclaude CLI
 *
 * Commands:
 *   heyclaude start [--theme T] [--animal A] [--web] [--position P] [--session-id S]
 *   heyclaude stop [--all]      Kill daemon for this session (or all sessions)
 *   heyclaude render            Run just the render-loop (used by pane internally)
 *   heyclaude status [--all]    Print current daemon state (or all sessions)
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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { getPidDir } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

// Legacy single-session PID file (kept for backward compat)
const LEGACY_PID_FILE = join(homedir(), '.heyclaude.pid');

// ── arg parsing ──────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

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
        i++;
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

if (flags['help']) { printHelp(); process.exit(0); }
if (flags['version']) { printVersion(); process.exit(0); }

const cmd    = positional[0] ?? 'start';
const subCmd = positional[1];

// ── helpers ───────────────────────────────────────────────────────────────────

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch { return '0.0.0'; }
}

function printVersion(): void { console.log(`heyclaude v${getVersion()}`); }

function printHelp(): void {
  console.log(`
heyclaude v${getVersion()} - Animated Claude Code mascot

Usage:
  heyclaude <command> [options]

Commands:
  start                Start daemon + open mascot pane
  stop [--all]         Kill daemon for this session (--all kills every session)
  render               Run the render loop (used internally by pane)
  status [--all]       Show daemon state (--all shows every running session)
  animal               Show current session's animal
  animals              List all available sprites with emoji
  preview <name>       Render one frame of a sprite to stdout
  demo                 Cycle through all animation states (2s each)
  popup                Launch popup mascot (starts daemon if needed)
  popup list           List all available mascots
  popup stop           Close the popup
  config show          Display current config as JSON
  config set <K> <V>   Set a config key
  config reset         Reset config to defaults

Options for 'start':
  --theme <name>       Theme name (claude, ocean, forest, neon, mono)
  --animal <name>      Override animal (e.g. cat, owl, dragon)
  --mode <mode>        Display mode: terminal (default), popup (Electron), web (browser)
  --position <pos>     Pane position (left, right)
  --session-id <id>    Override session ID (advanced)

Global options:
  --help, -h           Show this help
  --version, -v        Show version
`.trim());
}

function scriptPath(name: string): string {
  const dist = join(ROOT, 'dist', `${name}.js`);
  const src  = join(ROOT, 'src',  `${name}.ts`);
  return existsSync(dist) ? dist : src;
}

function nodeRunner(script: string): { cmd: string; args: string[] } {
  return script.endsWith('.ts')
    ? { cmd: 'tsx', args: [script] }
    : { cmd: 'node', args: [script] };
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function writePidFile(sessionId: string, pid: number) {
  const pidDir = getPidDir();
  mkdirSync(pidDir, { recursive: true });
  writeFileSync(join(pidDir, `${sessionId}.pid`), String(pid), 'utf8');
  // Also write legacy file for single-session backward compat
  writeFileSync(LEGACY_PID_FILE, String(pid), 'utf8');
}

// ── Session helpers ───────────────────────────────────────────────────────────

/** Resolve the session ID for this CLI invocation. */
async function getSessionId(): Promise<string> {
  // Explicit override
  if (typeof flags['session-id'] === 'string') return flags['session-id'];

  const { resolveSessionId } = await import('./session-resolver.js');
  return resolveSessionId() ?? 'default';
}

/** Check if a daemon is already running for the given session. */
async function isRunningForSession(sessionId: string): Promise<boolean> {
  const { lookupSession } = await import('./registry.js');
  const entry = lookupSession(sessionId);
  if (!entry) return false;
  try {
    const res = await fetch(`http://localhost:${entry.daemonPort}/status`, {
      signal: AbortSignal.timeout(500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── commands ──────────────────────────────────────────────────────────────────

/** Open the mascot display (tmux pane / popup / web) for an already-running daemon. */
async function openDisplay(daemonPort: number, wsPort: number): Promise<void> {
  const mode = (typeof flags['mode'] === 'string' ? flags['mode'] : 'auto') as 'auto' | 'terminal' | 'popup' | 'web';

  if (mode === 'web') {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [`http://localhost:${daemonPort}`], { detached: true, stdio: 'ignore' }).unref();
    console.log(`[heyclaude] opened web UI in browser`);
    return;
  }

  const { selectAdapter } = await import('./adapters/index.js');
  const adapter = selectAdapter(mode === 'auto' ? undefined : mode);

  const isWSL = process.platform === 'linux' &&
    (() => { try { return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft'); } catch { return false; } })();

  const portEnv = `HEYCLAUDE_WS_PORT=${wsPort} HEYCLAUDE_DAEMON_PORT=${daemonPort}`;
  const openArg = (adapter.name === 'standalone' && isWSL)
    ? `http://localhost:${daemonPort}`
    : (() => {
        const r = nodeRunner(scriptPath('render-loop'));
        return `${portEnv} ${r.cmd} "${r.args[0]}"`;
      })();

  const ok = adapter.open(openArg);
  if (ok) console.log(`[heyclaude] mascot opened via ${adapter.name}`);
}

async function cmdStart() {
  const { pruneStaleEntries, withRegistry, allocatePortPair } = await import('./registry.js');
  const { loadConfig } = await import('./config.js');

  // Remove stale registry entries before checking
  await pruneStaleEntries();

  const sessionId = await getSessionId();

  if (await isRunningForSession(sessionId)) {
    // Daemon is alive — check if display is also connected
    const { lookupSession } = await import('./registry.js');
    const existing = lookupSession(sessionId);
    if (existing) {
      try {
        const res  = await fetch(`http://localhost:${existing.daemonPort}/status`, { signal: AbortSignal.timeout(500) });
        const data = await res.json() as any;
        if (data.clients > 0) {
          console.log(`[heyclaude] already running for session ${sessionId.slice(0, 8)}.`);
          process.exit(0);
        }
        // Daemon alive but no display connected — reopen display only
        console.log(`[heyclaude] daemon alive but no display — reopening...`);
        await openDisplay(existing.daemonPort, existing.wsPort);
        process.exit(0);
      } catch { /* fall through to normal start */ }
    }
  }

  // Build config overrides from CLI flags
  const cliOverrides: Record<string, string> = {};
  if (typeof flags['theme']    === 'string') cliOverrides.theme    = flags['theme'];
  if (typeof flags['animal']   === 'string') cliOverrides.animal   = flags['animal'];
  if (typeof flags['position'] === 'string') cliOverrides.position = flags['position'];

  const config = loadConfig(cliOverrides);

  // Allocate ports under registry lock (race-condition safe)
  let daemonPort: number;
  let wsPort: number;

  await withRegistry(async (registry) => {
    const pair = await allocatePortPair(registry, config.daemonPort);
    daemonPort = pair.daemonPort;
    wsPort     = pair.wsPort;
    // Pre-claim the slot so concurrent starts don't steal these ports
    registry[sessionId] = {
      sessionId,
      daemonPort,
      wsPort,
      pid: 0, // will be updated by daemon on startup
      startedAt: new Date().toISOString(),
    };
  });

  // Spawn daemon detached with session args
  const daemonScript = scriptPath('daemon');
  const runner = nodeRunner(daemonScript);
  const daemon = spawn(runner.cmd, [
    ...runner.args,
    '--session-id', sessionId,
    '--daemon-port', String(daemonPort!),
    '--ws-port',     String(wsPort!),
  ], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      HEYCLAUDE_DAEMON_PORT: String(daemonPort!),
      HEYCLAUDE_WS_PORT:     String(wsPort!),
    },
  });
  daemon.unref();

  if (daemon.pid) {
    writePidFile(sessionId, daemon.pid);
    console.log(`[heyclaude] daemon started (pid=${daemon.pid} session=${sessionId.slice(0, 8)} port=${daemonPort!})`);
  }

  // Wait briefly for daemon to boot and register itself
  await sleep(600);

  await openDisplay(daemonPort!, wsPort!);

  const { animalFromSessionId } = await import('./sprites/index.js');
  const animal = animalFromSessionId(sessionId);
  console.log(`[heyclaude] your mascot: ${animal}`);
  console.log(`[heyclaude] web UI: http://localhost:${daemonPort!}`);
}

async function cmdStop() {
  const { readRegistry, unregisterSession } = await import('./registry.js');

  if (flags['all'] === true) {
    // Kill every registered daemon
    const registry = readRegistry();
    const entries = Object.values(registry);
    if (entries.length === 0) {
      console.log('[heyclaude] no sessions running');
      return;
    }
    for (const entry of entries) {
      await stopDaemon(entry.sessionId, entry.daemonPort, entry.pid);
    }
    console.log(`[heyclaude] stopped ${entries.length} session(s)`);
    return;
  }

  const sessionId = await getSessionId();
  const { lookupSession } = await import('./registry.js');
  const entry = lookupSession(sessionId);

  if (!entry) {
    // Legacy fallback: try the old PID file
    try {
      const pid = parseInt(readFileSync(LEGACY_PID_FILE, 'utf8').trim(), 10);
      if (pid) {
        process.kill(pid, 'SIGTERM');
        console.log(`[heyclaude] daemon stopped (legacy pid=${pid})`);
      }
    } catch {
      console.log('[heyclaude] no daemon running for this session');
    }
    return;
  }

  await stopDaemon(entry.sessionId, entry.daemonPort, entry.pid);
}

async function stopDaemon(sessionId: string, daemonPort: number, pid: number) {
  // Close the tmux pane for this specific session
  const { selectAdapter } = await import('./adapters/index.js');
  const adapter = selectAdapter() as any;
  if (typeof adapter.closeSession === 'function') {
    adapter.closeSession(daemonPort);
  }

  // Try HTTP graceful stop first (daemon unregisters itself)
  try {
    await fetch(`http://localhost:${daemonPort}/stop`, {
      method: 'POST',
      signal: AbortSignal.timeout(500),
    });
    console.log(`[heyclaude] session ${sessionId.slice(0, 8)} stopped`);
    return;
  } catch { /* daemon not responding, kill by PID */ }

  // Fallback: kill by PID
  if (pid > 0) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`[heyclaude] session ${sessionId.slice(0, 8)} killed (pid=${pid})`);
    } catch {
      console.log(`[heyclaude] session ${sessionId.slice(0, 8)}: process already gone`);
    }
  }

  // Clean up registry manually (daemon may not have cleaned up)
  const { unregisterSession } = await import('./registry.js');
  await unregisterSession(sessionId);
}

async function cmdRender() {
  await import('./render-loop.js');
}

async function cmdStatus() {
  if (flags['all'] === true) {
    const { readRegistry } = await import('./registry.js');
    const registry = readRegistry();
    const entries = Object.values(registry);
    if (entries.length === 0) {
      console.log('[heyclaude] no sessions running');
      return;
    }
    for (const entry of entries) {
      try {
        const res  = await fetch(`http://localhost:${entry.daemonPort}/status`, { signal: AbortSignal.timeout(1000) });
        const data = await res.json() as any;
        console.log(`── session ${entry.sessionId.slice(0, 8)} (port ${entry.daemonPort}) ──`);
        console.log(JSON.stringify(data, null, 2));
      } catch {
        console.log(`── session ${entry.sessionId.slice(0, 8)} (port ${entry.daemonPort}) — unreachable ──`);
      }
    }
    return;
  }

  const sessionId = await getSessionId();
  const { lookupSession } = await import('./registry.js');
  const entry = lookupSession(sessionId);

  if (!entry) {
    console.log('[heyclaude] no daemon running for this session');
    return;
  }

  try {
    const res  = await fetch(`http://localhost:${entry.daemonPort}/status`, { signal: AbortSignal.timeout(1000) });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch {
    console.log('[heyclaude] daemon is not responding');
  }
}

async function cmdAnimal() {
  const { resolveSessionId, sessionIdFromClaudePid, findClaudePid } = await import('./session-resolver.js');
  const sessionId = resolveSessionId() ?? 'default';
  const { animalFromSessionId } = await import('./sprites/index.js');
  const animal = animalFromSessionId(sessionId);
  console.log(`animal: ${animal}  (session: ${sessionId.slice(0, 8)}...)`);
}

async function cmdAnimals() {
  const { SUPPORTED_ANIMALS, getSprite } = await import('./sprites/index.js');

  console.log('Available sprites:\n');
  const seen = new Set<string>();
  for (const name of SUPPORTED_ANIMALS) {
    const sprite = getSprite(name);
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
  if (!name) { console.error('Usage: heyclaude preview <sprite-name>'); process.exit(1); }
  const { getSprite } = await import('./sprites/index.js');
  const { renderUI }  = await import('./renderer.js');
  process.stdout.write(renderUI(getSprite(name), 'idle', 0));
}

async function cmdDemo() {
  const { getSprite }   = await import('./sprites/index.js');
  const { renderUI }    = await import('./renderer.js');
  const { resolveSessionId } = await import('./session-resolver.js');
  const { animalFromSessionId } = await import('./sprites/index.js');

  const sessionId = resolveSessionId() ?? 'default';
  const sprite = getSprite(animalFromSessionId(sessionId));

  const states: string[] = [
    'idle', 'thinking', 'coding', 'reading', 'searching',
    'browsing', 'executing', 'planning', 'waiting',
    'success', 'error', 'mcp', 'skill', 'sleeping', 'greeting',
  ];

  for (const state of states) {
    process.stdout.write(renderUI(sprite, state as any, 0));
    console.log(`\n  State: ${state}`);
    await sleep(2000);
  }
  console.log('\n[heyclaude] demo complete');
}

async function cmdConfigShow() {
  const { loadConfig } = await import('./config.js');
  console.log(JSON.stringify(loadConfig(), null, 2));
}

async function cmdConfigSet(key: string | undefined, value: string | undefined) {
  if (!key || value === undefined) {
    console.error('Usage: heyclaude config set <key> <value>');
    process.exit(1);
  }
  const { saveConfig } = await import('./config.js');
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
    const cols = 4;
    for (let i = 0; i < animals.length; i += cols) {
      const row = animals.slice(i, i + cols).map(a => `  ${a.emoji}  ${a.name.padEnd(12)}`).join('');
      console.log(row);
    }
    console.log(`\n  Use: heyclaude popup --animal <name>\n`);
    return;
  }

  if (sub === 'stop' || sub === 'kill') {
    try {
      const { execSync } = await import('child_process');
      execSync('pkill -f "Electron.*main.cjs"', { stdio: 'ignore' });
      console.log('[heyclaude] popup closed');
    } catch {
      console.log('[heyclaude] no popup running');
    }
    return;
  }

  // Start: ensure daemon is running for this session, then launch popup
  const sessionId = await getSessionId();
  if (!(await isRunningForSession(sessionId))) {
    await cmdStart();
    return; // cmdStart already opens the display
  }

  if (typeof flags['animal'] === 'string') {
    const { lookupSession } = await import('./registry.js');
    const entry = lookupSession(sessionId);
    if (entry) {
      try {
        await fetch(`http://localhost:${entry.daemonPort}/animal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ animal: flags['animal'] }),
          signal: AbortSignal.timeout(1000),
        });
      } catch { /* daemon might not be ready */ }
    }
  }

  const { selectAdapter } = await import('./adapters/index.js');
  const adapter = selectAdapter('popup');
  const ok = adapter.open('');
  if (ok) {
    const { animalFromSessionId } = await import('./sprites/index.js');
    const animal = typeof flags['animal'] === 'string' ? flags['animal'] : animalFromSessionId(sessionId);
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
