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

const RESET  = '\x1b[0m';
const CLEAR  = '\x1b[2J\x1b[H';
const HOME   = '\x1b[H';
const UPPER  = '▀';

const BG_COLOR = '#1a1a2e'; // Claude dark background

// ── ANSI true-color helpers ───────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function trueColor(fg: string, bg: string): string {
  const [fr, fg_, fb] = hexToRgb(fg);
  const [br, bg_, bb] = hexToRgb(bg);
  return `\x1b[38;2;${fr};${fg_};${fb}m\x1b[48;2;${br};${bg_};${bb}m`;
}

function bgOnly(bg: string): string {
  const [r, g, b] = hexToRgb(bg);
  return `\x1b[48;2;${r};${g};${b}m`;
}

// ── Frame renderer ────────────────────────────────────────────────────────────

/**
 * Render a 16×16 sprite frame to an ANSI string.
 * Returns 8 terminal rows of 16 chars each (+ resets and newlines).
 */
export function renderFrame(frame: string[], palette: string[]): string {
  let out = '';
  for (let row = 0; row < 16; row += 2) {
    for (let col = 0; col < 16; col++) {
      const topIdx = parseInt(frame[row][col], 16);
      const botIdx = parseInt(frame[row + 1]?.[col] ?? '0', 16);

      const topColor = topIdx > 0 ? palette[topIdx - 1] : BG_COLOR;
      const botColor = botIdx > 0 ? palette[botIdx - 1] : BG_COLOR;

      if (topColor === botColor) {
        out += bgOnly(topColor) + ' ';
      } else {
        out += trueColor(topColor, botColor) + UPPER;
      }
    }
    out += RESET + '\n';
  }
  return out;
}

// ── State label renderer ──────────────────────────────────────────────────────

const STATE_LABELS: Record<AnimationState, string> = {
  idle:      'idle',
  thinking:  'thinking...',
  coding:    'coding',
  reading:   'reading',
  searching: 'searching',
  browsing:  'browsing web',
  executing: 'executing',
  planning:  'planning',
  waiting:   'waiting...',
  success:   'done! ✓',
  error:     'oops!',
  mcp:       'plugin call',
  skill:     'using skill',
};

/** Claude orange + purple ANSI colors for the UI chrome */
const C_ORANGE = '\x1b[38;2;218;119;86m';   // #da7756
const C_PURPLE = '\x1b[38;2;124;106;247m';  // #7c6af7
const C_DIM    = '\x1b[38;2;100;100;130m';
const C_BOLD   = '\x1b[1m';
const DIM_BG   = '\x1b[48;2;26;26;46m';     // #1a1a2e

export function renderUI(
  sprite: Sprite,
  state: AnimationState,
  frameIndex: number,
  customLabel?: string,
): string {
  const frames = sprite.states[state] ?? sprite.states.idle;
  const frame  = frames[frameIndex % frames.length];

  const label     = customLabel ?? STATE_LABELS[state];
  const animalStr = sprite.name.padEnd(8).slice(0, 8);
  const labelStr  = label.padEnd(10).slice(0, 10);

  // Top border — 20 chars wide (16 sprite + 2 padding each side)
  const border = DIM_BG + C_DIM + '╭' + '─'.repeat(18) + '╮' + RESET + '\n';
  const bottom = DIM_BG + C_DIM + '╰' + '─'.repeat(18) + '╯' + RESET + '\n';
  const empty  = DIM_BG + C_DIM + '│' + ' '.repeat(18) + '│' + RESET + '\n';

  // Sprite rows with side borders
  let spriteSection = '';
  const frameLines = renderFrame(frame, sprite.palette).split('\n').filter(Boolean);
  for (const line of frameLines) {
    spriteSection += DIM_BG + C_DIM + '│ ' + RESET + line + DIM_BG + C_DIM + ' │' + RESET + '\n';
  }

  // Status row
  const statusLine =
    DIM_BG + C_DIM + '│ ' + RESET +
    DIM_BG + C_ORANGE + C_BOLD + sprite.emoji + ' ' + animalStr + RESET +
    DIM_BG + C_DIM + '│' + RESET + '\n';

  const labelLine =
    DIM_BG + C_DIM + '│ ' + RESET +
    DIM_BG + C_PURPLE + '⟳ ' + labelStr + '  ' + RESET +
    DIM_BG + C_DIM + '│' + RESET + '\n';

  return CLEAR + border + empty + spriteSection + empty + statusLine + labelLine + empty + bottom;
}
