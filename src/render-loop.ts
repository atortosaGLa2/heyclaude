/**
 * heyclaude render-loop
 *
 * Runs inside the tmux pane (or standalone terminal). Connects to the daemon
 * via WebSocket, receives state updates, and renders the animated mascot.
 *
 * Usage: heyclaude render  (launched into a split pane)
 */

import { WebSocket } from 'ws';
import { getSprite }   from './sprites/index.js';
import { renderUI }    from './renderer.js';
import { getFrameSpeed, SLEEP_TIMEOUT } from './states.js';
import { ParticleEngine } from './particles.js';
import type { DaemonState, AnimationState } from './types.js';
import type { RenderTheme } from './renderer.js';

const WS_URL = `ws://localhost:${process.env.HEYCLAUDE_WS_PORT ?? '7338'}`;

let current: DaemonState = {
  animal:    'crab',
  sessionId: '',
  state:     'idle',
  label:     '',
};

let frameIndex      = 0;
let frameTimer: ReturnType<typeof setTimeout> | null = null;
let connected       = false;
let stateStartTime  = Date.now();
let lastActivityTime = Date.now();

// Particle engine
const particles = new ParticleEngine();

// Theme (can be overridden via env or daemon message)
let theme: RenderTheme | undefined;
if (process.env.HEYCLAUDE_THEME_BG) {
  theme = {
    bg:      process.env.HEYCLAUDE_THEME_BG ?? '#1a1a2e',
    border:  process.env.HEYCLAUDE_THEME_BORDER ?? '#2a2a4e',
    accent1: process.env.HEYCLAUDE_THEME_ACCENT1 ?? '#da7756',
    accent2: process.env.HEYCLAUDE_THEME_ACCENT2 ?? '#7c6af7',
    dim:     process.env.HEYCLAUDE_THEME_DIM ?? '#646682',
    text:    process.env.HEYCLAUDE_THEME_TEXT ?? '#e0e0e0',
  };
}

// ── Render tick ───────────────────────────────────────────────────────────────

function renderTick() {
  // Auto-sleep after 5 minutes of idle
  const effectiveState = (
    current.state === 'idle' &&
    Date.now() - lastActivityTime > SLEEP_TIMEOUT
  ) ? 'sleeping' as AnimationState : current.state as AnimationState;

  const sprite = getSprite(current.animal);

  // Update particle engine
  particles.setState(effectiveState);
  particles.tick();

  const output = renderUI(
    sprite,
    effectiveState,
    frameIndex,
    current.label || undefined,
    theme,
    particles,
    stateStartTime,
  );
  process.stdout.write(output);
  frameIndex++;

  const speed = getFrameSpeed(effectiveState);
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
        stateStartTime = Date.now();
        lastActivityTime = Date.now();
      }
    } catch { /* ignore bad messages */ }
  });

  ws.on('close', () => {
    connected = false;
    setTimeout(connect, 2000);
  });

  ws.on('error', () => {
    if (!connected) setTimeout(connect, 2000);
  });
}

// ── Hide cursor, handle exit ──────────────────────────────────────────────────

process.stdout.write('\x1b[?25l'); // hide cursor
process.on('exit',    () => process.stdout.write('\x1b[?25h\x1b[0m'));
process.on('SIGINT',  () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// ── Boot ──────────────────────────────────────────────────────────────────────

connect();
startRendering();
