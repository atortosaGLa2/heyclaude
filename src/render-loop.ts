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
import { getTheme, ANIMAL_THEMES } from './themes.js';
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
const TRANSITION_FRAMES = 3; // Default transition frames
const TRANSITION_FRAMES_WAITING = 6; // Longer flash for waiting (more visible)

// State transition flash colors (first flash frame color)
const TRANSITION_FLASH: Partial<Record<AnimationState, string>> = {
  success:   '#22cc66',
  error:     '#ff4444',
  waiting:   '#ffffff', // starts white, fades to amber
  coding:    '#7c6af7',
  executing: '#ffaa22',
  greeting:  '#ffcc44',
  sleeping:  '#6666aa',
};

// Final steady-state border colors (for multi-frame fade targets)
const TRANSITION_FLASH_TARGET: Partial<Record<AnimationState, string>> = {
  waiting: '#ffaa44',
};

function startTransition(from: AnimationState, to: AnimationState): void {
  const frames = to === 'waiting' ? TRANSITION_FRAMES_WAITING : TRANSITION_FRAMES;
  activeTransition = {
    fromState: from,
    toState: to,
    framesRemaining: frames,
    totalFrames: frames,
  };
}

/** Interpolate between two hex colors by t (0=from, 1=to) */
function lerpColor(from: string, to: string, t: number): string {
  const f = parseInt(from.replace('#', ''), 16);
  const target = parseInt(to.replace('#', ''), 16);
  const r = Math.round(((f >> 16) & 0xff) * (1 - t) + ((target >> 16) & 0xff) * t);
  const g = Math.round(((f >> 8) & 0xff) * (1 - t) + ((target >> 8) & 0xff) * t);
  const b = Math.round((f & 0xff) * (1 - t) + (target & 0xff) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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

// User-explicit theme via env vars (set by --theme flag)
let userTheme: RenderTheme | undefined;
if (process.env.HEYCLAUDE_THEME_BG) {
  userTheme = {
    bg:      process.env.HEYCLAUDE_THEME_BG ?? '#1a1a2e',
    border:  process.env.HEYCLAUDE_THEME_BORDER ?? '#2a2a4e',
    accent1: process.env.HEYCLAUDE_THEME_ACCENT1 ?? '#da7756',
    accent2: process.env.HEYCLAUDE_THEME_ACCENT2 ?? '#7c6af7',
    dim:     process.env.HEYCLAUDE_THEME_DIM ?? '#646682',
    text:    process.env.HEYCLAUDE_THEME_TEXT ?? '#e0e0e0',
  };
}

/** Resolve theme for current animal: user flag > per-animal default > built-in default */
function resolveTheme(animal: string): RenderTheme {
  if (userTheme) return userTheme;
  const animalThemeName = ANIMAL_THEMES[animal.toLowerCase()];
  if (animalThemeName) {
    const t = getTheme(animalThemeName);
    return { bg: t.bg, border: t.border, accent1: t.accent1, accent2: t.accent2, dim: t.dim, text: t.text };
  }
  return { bg: '#1a1a2e', border: '#2a2a4e', accent1: '#da7756', accent2: '#7c6af7', dim: '#646682', text: '#e0e0e0' };
}

// ── Render tick ───────────────────────────────────────────────────────────────

function renderTick() {
  // Auto-sleep after 5 minutes of idle
  const effectiveState = (
    current.state === 'idle' &&
    Date.now() - lastActivityTime > SLEEP_TIMEOUT
  ) ? 'sleeping' as AnimationState : current.state as AnimationState;

  const sprite = getSprite(current.animal);
  const baseTheme = resolveTheme(current.animal);

  // Update particle engine
  particles.setState(effectiveState);
  particles.tick();

  // During transition, apply a flash effect via borderOverride
  let renderTheme: RenderTheme = baseTheme;
  if (isTransitioning() && activeTransition) {
    const flashStart = TRANSITION_FLASH[activeTransition.toState];
    if (flashStart) {
      const progress = activeTransition.framesRemaining / activeTransition.totalFrames; // 1→0
      const flashEnd = TRANSITION_FLASH_TARGET[activeTransition.toState];
      const borderOverride = flashEnd
        ? lerpColor(flashStart, flashEnd, 1 - progress) // fade from start → target
        : flashStart;
      renderTheme = { ...baseTheme, borderOverride };
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
