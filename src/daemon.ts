/**
 * heyclaude daemon
 *
 * - HTTP server on :7337  → receives hook events from Claude Code
 * - WebSocket server on :7338 → pushes state to the render-loop process
 *
 * Usage: heyclaude start  (called by install script / user)
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { detectAnimal } from './session.js';
import { hookEventToState, STATE_TIMEOUTS, FRAME_SPEED, STATE_LABELS } from './states.js';
import { getAllSprites } from './sprites/index.js';
import type { DaemonState, AnimationState } from './types.js';

const HTTP_PORT = parseInt(process.env.HEYCLAUDE_DAEMON_PORT ?? '7337', 10);
const WS_PORT   = parseInt(process.env.HEYCLAUDE_WS_PORT ?? '7338', 10);
const WEB_PORT  = parseInt(process.env.HEYCLAUDE_WEB_PORT ?? '7339', 10);

export { HTTP_PORT, WS_PORT };

const app = express();
app.use(express.json());

// CORS: allow the web UI to call the daemon API
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set<WebSocket>();

// ── Shared state ──────────────────────────────────────────────────────────────

const { animal, sessionId } = detectAnimal();

const daemonState: DaemonState = {
  animal,
  sessionId,
  state: 'greeting',
  label: 'hey!',
};

let idleTimer: ReturnType<typeof setTimeout> | null = null;

// Auto-transition from greeting to idle after 3s
setTimeout(() => {
  if (daemonState.state === 'greeting') {
    setState('idle', '');
  }
}, 3000);

function setState(state: AnimationState, label = '') {
  daemonState.state = state;
  daemonState.label = label;

  broadcast();

  // Auto-revert to idle after timeout
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
  res.json(daemonState);
});

app.get('/sprites', (_req, res) => {
  res.json({
    sprites: getAllSprites(),
    frameSpeeds: FRAME_SPEED,
    stateLabels: STATE_LABELS,
  });
});

app.post('/stop', (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 100);
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(HTTP_PORT, () => {
  process.stderr.write(
    `[heyclaude] daemon running · animal=${animal} · http=:${HTTP_PORT} · ws=:${WS_PORT}\n`
  );
});

// ── Web UI (optional, started via HEYCLAUDE_WEB=1 env) ───────────────────────

if (process.env.HEYCLAUDE_WEB === '1') {
  import('./web/server.js')
    .then(({ startWebServer }) => startWebServer(WEB_PORT))
    .catch(() => {
      process.stderr.write('[heyclaude] web UI module not available\n');
    });
}
