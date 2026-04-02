/**
 * Pixel art → ANSI terminal renderer
 *
 * Uses the Unicode UPPER HALF BLOCK (▀ U+2580) technique:
 *   Each pair of pixel rows collapses into one terminal row.
 *   The top pixel becomes the foreground colour (▀ upper half).
 *   The bottom pixel becomes the background colour (▀ lower half).
 *   This gives us effective 1:1 horizontal, 2:1 vertical pixel density.
 */

import type { Sprite } from './sprites/index.js';
import type { AnimationState } from './types.js';
import { STATE_LABELS, getSpinner } from './states.js';
import type { ParticleEngine } from './particles.js';

const RESET  = '\x1b[0m';
const CLEAR  = '\x1b[2J\x1b[H';
const UPPER  = '▀';
const BOLD   = '\x1b[1m';

// ── Theme interface (inline to avoid circular deps at render time) ──────────

export interface RenderTheme {
  bg: string;
  border: string;
  accent1: string;
  accent2: string;
  dim: string;
  text: string;
}

const DEFAULT_THEME: RenderTheme = {
  bg:      '#1a1a2e',
  border:  '#2a2a4e',
  accent1: '#da7756',
  accent2: '#7c6af7',
  dim:     '#646682',
  text:    '#e0e0e0',
};

// ── ANSI true-color helpers ───────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function fg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function trueColor(fgHex: string, bgHex: string): string {
  return fg(fgHex) + bg(bgHex);
}

// ── Frame cache ─────────────────────────────────────────────────────────────

const frameCache = new Map<string, string>();

function getCacheKey(frame: string[], palette: string[], bgColor: string): string {
  return frame.join('') + palette.join('') + bgColor;
}

// ── Frame renderer ────────────────────────────────────────────────────────────

/**
 * Render a 16×16 sprite frame to an ANSI string.
 * Returns 8 terminal rows of 16 chars each (+ resets and newlines).
 */
export function renderFrame(frame: string[], palette: string[], bgColor: string = DEFAULT_THEME.bg): string {
  const key = getCacheKey(frame, palette, bgColor);
  const cached = frameCache.get(key);
  if (cached) return cached;

  let out = '';
  for (let row = 0; row < 16; row += 2) {
    for (let col = 0; col < 16; col++) {
      const topIdx = parseInt(frame[row][col], 16);
      const botIdx = parseInt(frame[row + 1]?.[col] ?? '0', 16);

      const topColor = topIdx > 0 ? palette[topIdx - 1] : bgColor;
      const botColor = botIdx > 0 ? palette[botIdx - 1] : bgColor;

      if (topColor === botColor) {
        out += bg(topColor) + ' ';
      } else {
        out += trueColor(topColor, botColor) + UPPER;
      }
    }
    out += RESET + '\n';
  }

  // Keep cache bounded
  if (frameCache.size > 200) frameCache.clear();
  frameCache.set(key, out);
  return out;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function renderProgressBar(elapsed: number, width: number, color: string, bgColor: string): string {
  // Pulse every 10 seconds
  const cycle = 10000;
  const progress = (elapsed % cycle) / cycle;
  const filled = Math.floor(progress * width);

  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i < filled) {
      bar += fg(color) + bg(bgColor) + '━';
    } else if (i === filled) {
      bar += fg(color) + bg(bgColor) + '╸';
    } else {
      bar += fg(bgColor === '#1a1a2e' ? '#252545' : '#333333') + bg(bgColor) + '━';
    }
  }
  return bar + RESET;
}

// ── Elapsed time formatting ──────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

// ── Particle overlay ─────────────────────────────────────────────────────────

function applyParticleOverlay(
  frameLines: string[],
  particles: ParticleEngine | null,
  bgColor: string,
): string[] {
  if (!particles || !particles.hasParticles()) return frameLines;

  const overlay = particles.getOverlay();
  if (overlay.length === 0) return frameLines;

  // We work with the already-rendered lines, so we overlay by inserting
  // colored characters at specific positions in each line.
  // Since each line contains ANSI escape sequences, we reconstruct lines
  // with particle chars overlaid at the correct terminal columns.
  const result = [...frameLines];

  for (const p of overlay) {
    const { col, row, char, color, opacity } = p;
    if (row < 0 || row >= result.length || col < 0 || col >= 16) continue;
    if (opacity < 0.2) continue; // too faded

    // Build a particle character with color
    const pColor = color ?? '#ffffff';
    const particleStr = fg(pColor) + bg(bgColor) + char;

    // Append particle overlay indicator to the line
    // (rendered after the sprite row as a separate overlay line approach)
    // For simplicity, we'll add particles as a decoration row
  }

  return result;
}

// ── UI Renderer ──────────────────────────────────────────────────────────────

export function renderUI(
  sprite: Sprite,
  state: AnimationState,
  frameIndex: number,
  customLabel?: string,
  theme?: RenderTheme,
  particles?: ParticleEngine | null,
  stateStartTime?: number,
): string {
  const t = theme ?? DEFAULT_THEME;
  const frames = sprite.states[state] ?? sprite.states.idle;
  const frame  = frames[frameIndex % frames.length];

  const label     = customLabel ?? STATE_LABELS[state] ?? state;
  const spinner   = getSpinner(frameIndex);
  const elapsed   = stateStartTime ? Date.now() - stateStartTime : 0;
  const timeStr   = elapsed > 1000 ? formatElapsed(elapsed) : '';

  // ANSI theme colors — border color changes per state
  const cBg      = bg(t.bg);
  const borderColor = state === 'waiting' ? '#ffaa44'
    : state === 'error' ? '#ff4444'
    : state === 'success' ? '#22cc66'
    : state === 'coding' ? t.accent2
    : state === 'executing' ? '#ffaa22'
    : t.dim;
  const cBorder  = fg(borderColor);
  const cAccent1 = fg(t.accent1);
  const cAccent2 = fg(t.accent2);
  const cDim     = fg(t.dim);

  // Dimensions
  const innerW = 18; // 16 sprite + 1 padding each side
  const frameW = innerW + 2; // + 2 for border chars

  // ── Title bar ──
  const title = 'hey!claude';
  const titlePad = innerW - title.length - 2; // -2 for spacing
  const leftDash = Math.floor(titlePad / 2);
  const rightDash = titlePad - leftDash;
  const topBorder = cBg + cBorder + '╭' +
    '─'.repeat(leftDash) + ' ' +
    cAccent1 + BOLD + title + RESET +
    cBg + cBorder + ' ' + '─'.repeat(rightDash) +
    '╮' + RESET + '\n';

  const bottom = cBg + cBorder + '╰' + '─'.repeat(innerW) + '╯' + RESET + '\n';
  const empty  = cBg + cBorder + '│' + cBg + ' '.repeat(innerW) + cBorder + '│' + RESET + '\n';

  // ── Sprite rows with borders ──
  let spriteSection = '';
  const spriteOutput = renderFrame(frame, sprite.palette, t.bg);
  const spriteLines = spriteOutput.split('\n').filter(Boolean);

  // Apply particles if available
  const displayLines = particles
    ? applyParticleOverlay(spriteLines, particles, t.bg)
    : spriteLines;

  for (const line of displayLines) {
    spriteSection += cBg + cBorder + '│ ' + RESET + line + cBg + cBorder + ' │' + RESET + '\n';
  }

  // ── Animal name row ──
  const animalStr = (sprite.emoji + ' ' + sprite.name).padEnd(innerW - 2);
  const animalLine = cBg + cBorder + '│ ' + RESET +
    cBg + cAccent1 + BOLD + animalStr.slice(0, innerW - 2) + RESET +
    cBg + cBorder + ' │' + RESET + '\n';

  // ── State label row with spinner and elapsed time ──
  // Waiting state gets a blinking arrow indicator
  const stateIcon = state === 'waiting'
    ? (frameIndex % 2 === 0 ? '▶' : '▷')
    : spinner;
  const stateColor = state === 'waiting'
    ? fg('#ffaa44')  // amber for waiting
    : state === 'error'
    ? fg('#ff4444')  // red for error
    : state === 'success'
    ? fg('#22cc66')  // green for success
    : cAccent2;
  const labelContent = `${stateIcon} ${label}`;
  const maxLabelW = innerW - 2 - (timeStr ? timeStr.length + 1 : 0);
  const labelTrunc = labelContent.slice(0, maxLabelW);
  const gap = innerW - 2 - labelTrunc.length - (timeStr ? timeStr.length + 1 : 0);
  const labelLine = cBg + cBorder + '│ ' + RESET +
    cBg + stateColor + labelTrunc +
    (timeStr ? ' '.repeat(Math.max(1, gap)) + cDim + timeStr : ' '.repeat(Math.max(0, innerW - 2 - labelTrunc.length))) +
    RESET + cBg + cBorder + ' │' + RESET + '\n';

  // ── Progress bar row ──
  const progressBar = renderProgressBar(elapsed, innerW - 2, t.accent2, t.bg);
  const progressLine = cBg + cBorder + '│ ' + RESET +
    progressBar +
    cBg + cBorder + ' │' + RESET + '\n';

  return CLEAR +
    topBorder +
    empty +
    spriteSection +
    empty +
    animalLine +
    labelLine +
    progressLine +
    bottom;
}
