/**
 * heyclaude render-loop
 *
 * Runs inside the tmux pane (or standalone terminal). Connects to the daemon
 * via WebSocket, receives state updates, and renders the animated mascot.
 *
 * Features:
 * - Smooth state transitions with brief flash effect
 * - Particle effects overlay
 * - Auto-sleep after 5 minutes idle
 * - Theme support via env vars
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

// ── Transition system ─────────────────────────────────────────────────────────

interface Transition {
  fromState: AnimationState;
  toState: AnimationState;
  framesRemaining: number;
  totalFrames: number;
}

let activeTransition: Transition | null = null;
const TRANSITION_FRAMES = 3; // Number of transition frames (fast flash)

// State transition flash colors
const TRANSITION_FLASH: Partial<Record<AnimationState, string>> = {
  success:   '#22cc66',
  error:     '#ff4444',
  waiting:   '#ffaa44',
  coding:    '#7c6af7',
  executing: '#ffaa22',
  greeting:  '#ffcc44',
  sleeping:  '#6666aa',
};

function startTransition(from: AnimationState, to: AnimationState): void {
  activeTransition = {
    fromState: from,
    toState: to,
    framesRemaining: TRANSITION_FRAMES,
    totalFrames: TRANSITION_FRAMES,
  };
}

function isTransitioning(): boolean {
  return activeTransition !== null && activeTransition.framesRemaining > 0;
}

function tickTransition(): void {
  if (activeTransition) {
    activeTransition.framesRemaining--;
    if (activeTransition.framesRemaining <= 0) {
      activeTransition = null;
    }
  }
}

// ── Particle engine ───────────────────────────────────────────────────────────

const particles = new ParticleEngine();

// ── Theme ─────────────────────────────────────────────────────────────────────

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

  // During transition, apply a brief theme override for the flash effect
  let renderTheme = theme;
  if (isTransitioning() && activeTransition) {
    const flashColor = TRANSITION_FLASH[activeTransition.toState];
    if (flashColor) {
      const progress = activeTransition.framesRemaining / activeTransition.totalFrames;
      // Flash: border brightens then returns to normal
      if (progress > 0.5) {
        renderTheme = {
          ...(theme ?? {
            bg: '#1a1a2e', border: '#2a2a4e', accent1: '#da7756',
            accent2: '#7c6af7', dim: '#646682', text: '#e0e0e0',
          }),
          dim: flashColor, // Flash the border color
        };
      }
    }
    tickTransition();
  }

  const output = renderUI(
    sprite,
    effectiveState,
    frameIndex,
    current.label || undefined,
    renderTheme,
    particles,
    stateStartTime,
  );
  process.stdout.write(output);
  frameIndex++;

  // Speed: transitions render faster for snappy feel
  const speed = isTransitioning() ? 100 : getFrameSpeed(effectiveState);
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
        // State changed — trigger transition effect
        startTransition(prevState as AnimationState, data.state as AnimationState);
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
    // 'close' always fires after 'error' and handles reconnection
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
