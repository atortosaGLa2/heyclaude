import { describe, it, expect } from 'vitest';
import { renderFrame } from '../renderer.js';

// A simple all-zero frame (16 rows of 16 '0' chars)
const ZERO_FRAME = Array.from({ length: 16 }, () => '0000000000000000');

// A frame with some non-zero pixels
const MIXED_FRAME = [
  '0000000000000000',
  '0000011100000000',
  '0000122210000000',
  '0001222221000000',
  '0001233321000000',
  '0001222221000000',
  '0000122210000000',
  '0000011100000000',
  '0000000000000000',
  '0000011100000000',
  '0000122210000000',
  '0001222221000000',
  '0001233321000000',
  '0001222221000000',
  '0000122210000000',
  '0000011100000000',
];

const TEST_PALETTE = ['#ff0000', '#00ff00', '#0000ff'];
const BG_COLOR = '#1a1a2e';

describe('renderFrame', () => {
  it('produces output containing ANSI escape sequences', () => {
    const output = renderFrame(MIXED_FRAME, TEST_PALETTE, BG_COLOR);
    // ANSI escape sequences start with \x1b[
    expect(output).toContain('\x1b[');
  });

  it('produces output with only background color for all-zero frame', () => {
    const output = renderFrame(ZERO_FRAME, TEST_PALETTE, BG_COLOR);
    // All-zero frame means every pixel is background color
    // Should not contain any palette color references
    // But should still contain ANSI sequences for the background
    expect(output).toContain('\x1b[');
    // Should not contain the half-block character since top and bottom are both bg
    expect(output).not.toContain('▀');
  });

  it('produces exactly 8 lines of output (16 rows / 2)', () => {
    const output = renderFrame(MIXED_FRAME, TEST_PALETTE, BG_COLOR);
    // Split by newline, filter out empty trailing line
    const lines = output.split('\n').filter(Boolean);
    expect(lines.length).toBe(8);
  });

  it('contains the half-block character for frames with different top/bottom pixels', () => {
    const output = renderFrame(MIXED_FRAME, TEST_PALETTE, BG_COLOR);
    expect(output).toContain('▀');
  });
});
