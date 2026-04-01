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
import { hookEventToState, STATE_TIMEOUTS } from './states.js';
import type { DaemonState, AnimationState } from './types.js';

export const HTTP_PORT = 7337;
export const WS_PORT   = 7338;

const app = express();
app.use(express.json());

const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set<WebSocket>();

// ── Shared state ──────────────────────────────────────────────────────────────

const { animal, sessionId } = detectAnimal();

const daemonState: DaemonState = {
  animal,
  sessionId,
  state: 'idle',
  label: '',
};

let idleTimer: ReturnType<typeof setTimeout> | null = null;

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
  // Send current state immediately on connect
  ws.send(JSON.stringify(daemonState));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// ── HTTP API ──────────────────────────────────────────────────────────────────

/**
 * POST /event
 * Body: { event: string, tool?: string, label?: string }
 *
 * Called by Claude Code hooks (pre-tool.js, post-tool.js, prompt.js)
 */
app.post('/event', (req, res) => {
  const { event, tool, label } = req.body ?? {};
  const state = hookEventToState(event ?? 'PreToolUse', tool);
  setState(state, label ?? tool ?? '');
  res.json({ ok: true, animal: daemonState.animal, state });
});

/** GET /status — health check + current state */
app.get('/status', (_req, res) => {
  res.json(daemonState);
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(HTTP_PORT, () => {
  process.stderr.write(
    `[heyclaude] daemon running · animal=${animal} · http=:${HTTP_PORT} · ws=:${WS_PORT}\n`
  );
});
