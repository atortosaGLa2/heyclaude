import type { AnimationState } from '../types.js';

/**
 * A Sprite is a 16×16 pixel grid encoded as an array of 16 strings,
 * each 16 chars wide. Each char is a hex digit:
 *   '0' = transparent (rendered as background color)
 *   '1'-'f' = index into `palette` (palette[parseInt(c,16) - 1])
 *
 * Rendered via half-block (▀) technique:
 *   2 pixel rows → 1 terminal row
 *   foreground = top pixel color, background = bottom pixel color
 */
export interface Sprite {
  name: string;
  emoji: string;
  palette: string[];
  states: Partial<Record<AnimationState, string[][]>> & { idle: string[][] };
}
