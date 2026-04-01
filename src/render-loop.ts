/**
 * heyclaude render-loop
 *
 * Runs inside the tmux pane. Connects to the daemon via WebSocket,
 * receives state updates, and renders the animated mascot to stdout.
 *
 * Usage: heyclaude render  (launched by tmux.ts into a split pane)
 */

import { WebSocket } from 'ws';
import { getSprite }   from './sprites/index.js';
import { renderUI }    from './renderer.js';
import { getFrameSpeed } from './states.js';
import type { DaemonState, AnimationState } from './types.js';

const WS_URL = 'ws://localhost:7338';

let current: DaemonState = {
  animal:    'crab',
  sessionId: '',
  state:     'idle',
  label:     '',
};

let frameIndex  = 0;
let frameTimer: ReturnType<typeof setTimeout> | null = null;
let connected   = false;

// ── Render tick ───────────────────────────────────────────────────────────────

function renderTick() {
  const sprite = getSprite(current.animal);
  const output = renderUI(sprite, current.state as AnimationState, frameIndex, current.label || undefined);
  process.stdout.write(output);
  frameIndex++;

  const speed = getFrameSpeed(current.state as AnimationState);
  frameTimer = setTimeout(renderTick, speed);
}

function startRendering() {
  if (frameTimer) clearTimeout(frameTimer);
  frameIndex = 0;
  renderTick();
}

// ── WebSocket connection ──────────────────────────────────────────────────────

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    connected = true;
    process.stderr.write('[heyclaude] render connected\n');
  });

  ws.on('message', (raw) => {
    try {
      const data: DaemonState = JSON.parse(raw.toString());
      const prevState = current.state;
      current = data;

      if (data.state !== prevState) {
        // State changed — restart frame sequence
        frameIndex = 0;
      }
    } catch { /* ignore bad messages */ }
  });

  ws.on('close', () => {
    connected = false;
    // Retry connection every 2s
    setTimeout(connect, 2000);
  });

  ws.on('error', () => {
    if (!connected) setTimeout(connect, 2000);
  });
}

// ── Hide cursor, handle exit ──────────────────────────────────────────────────

process.stdout.write('\x1b[?25l'); // hide cursor
process.on('exit',   () => process.stdout.write('\x1b[?25h\x1b[0m'));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM',() => process.exit(0));

// ── Boot ──────────────────────────────────────────────────────────────────────

connect();
startRendering();
