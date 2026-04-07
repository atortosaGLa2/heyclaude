/**
 * heyclaude daemon
 *
 * - HTTP server on :PORT  → hook events API + web UI
 * - WebSocket server on :WS_PORT → pushes state to render-loop / web UI
 *
 * Args (take priority over env vars):
 *   --session-id <id>     Claude Code session ID for this daemon
 *   --daemon-port <n>     HTTP port (default 7337)
 *   --ws-port <n>         WebSocket port (default 7338)
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { animalFromSessionId } from './sprites/index.js';
import { hookEventToState, STATE_TIMEOUTS, FRAME_SPEED, STATE_LABELS } from './states.js';
import { getAllSprites } from './sprites/index.js';
import { registerSession, unregisterSession } from './registry.js';
import type { DaemonState, AnimationState } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgv(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

const args = parseArgv(process.argv.slice(2));

const SESSION_ID = args['session-id'] ?? process.env.CLAUDE_SESSION_ID ?? 'default';
const HTTP_PORT  = parseInt(args['daemon-port'] ?? process.env.HEYCLAUDE_DAEMON_PORT ?? '7337', 10);
const WS_PORT    = parseInt(args['ws-port']     ?? process.env.HEYCLAUDE_WS_PORT     ?? '7338', 10);

export { HTTP_PORT, WS_PORT };

// ── Express + WebSocket setup ─────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Serve web UI from the daemon itself (no separate server needed)
app.use(express.static(join(__dirname, 'web')));
app.use(express.static(join(__dirname, '..', 'src', 'web')));
// Also serve popup.html from electron dir (used by Edge app-mode popup in WSL)
app.use(express.static(join(__dirname, 'electron')));
app.use(express.static(join(__dirname, '..', 'src', 'electron')));

const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set<WebSocket>();

// ── Shared state ──────────────────────────────────────────────────────────────

const animal = animalFromSessionId(SESSION_ID);

const daemonState: DaemonState = {
  animal,
  sessionId: SESSION_ID,
  state: 'greeting',
  label: 'hey!',
};

let idleTimer: ReturnType<typeof setTimeout> | null = null;

setTimeout(() => {
  if (daemonState.state === 'greeting') setState('idle', '');
}, 3000);

function setState(state: AnimationState, label = '') {
  daemonState.state = state;
  daemonState.label = label;
  broadcast();

  if (idleTimer) clearTimeout(idleTimer);
  const timeout = STATE_TIMEOUTS[state];
  if (timeout !== undefined) {
    idleTimer = setTimeout(() => {
      daemonState.state = 'idle';
      daemonState.label = '';
      broadcast();
    }, timeout);
  }
}

function broadcast() {
  const msg = JSON.stringify(daemonState);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify(daemonState));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// ── HTTP API ──────────────────────────────────────────────────────────────────

app.post('/event', (req, res) => {
  const { event, tool, label } = req.body ?? {};
  const state = hookEventToState(event ?? 'PreToolUse', tool);
  setState(state, label ?? tool ?? '');
  res.json({ ok: true, animal: daemonState.animal, state });
});

app.get('/status', (_req, res) => {
  res.json({ ...daemonState, daemonPort: HTTP_PORT, wsPort: WS_PORT, clients: clients.size });
});

app.get('/sprites', (_req, res) => {
  res.json({
    sprites: getAllSprites(),
    frameSpeeds: FRAME_SPEED,
    stateLabels: STATE_LABELS,
  });
});

app.post('/animal', (req, res) => {
  const { animal: newAnimal } = req.body ?? {};
  if (newAnimal && typeof newAnimal === 'string') {
    daemonState.animal = newAnimal;
    broadcast();
    res.json({ ok: true, animal: newAnimal });
  } else {
    res.status(400).json({ error: 'provide { "animal": "name" }' });
  }
});

app.post('/stop', (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => cleanup(0), 100);
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

async function cleanup(code = 0) {
  try {
    await unregisterSession(SESSION_ID);
  } catch { /* best-effort */ }
  process.exit(code);
}

process.on('SIGTERM', () => cleanup(0));
process.on('SIGINT',  () => cleanup(0));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(HTTP_PORT, async () => {
  // Register in the session registry so hooks can find this daemon
  await registerSession({
    sessionId: SESSION_ID,
    daemonPort: HTTP_PORT,
    wsPort:     WS_PORT,
    pid:        process.pid,
    startedAt:  new Date().toISOString(),
    animal,
  });

  process.stderr.write(
    `[heyclaude] daemon · session=${SESSION_ID.slice(0, 8)} · animal=${animal} · http=:${HTTP_PORT} · ws=:${WS_PORT}\n`
  );
});
