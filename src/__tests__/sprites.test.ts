import { describe, it, expect } from 'vitest';
import { getSprite, SUPPORTED_ANIMALS, getAllSprites } from '../sprites/index.js';
import type { AnimationState } from '../types.js';

const ALL_STATES: AnimationState[] = [
  'idle', 'thinking', 'coding', 'reading', 'searching', 'browsing',
  'executing', 'planning', 'waiting', 'success', 'error', 'mcp', 'skill',
];

describe('SUPPORTED_ANIMALS', () => {
  it('contains at least 10 animals', () => {
    expect(SUPPORTED_ANIMALS.length).toBeGreaterThanOrEqual(10);
  });

  it('includes the core set of animals', () => {
    const expected = ['crab', 'octopus', 'bunny', 'cat', 'owl', 'fox', 'penguin', 'dragon', 'robot', 'panda'];
    for (const animal of expected) {
      expect(SUPPORTED_ANIMALS).toContain(animal);
    }
  });
});

describe('getSprite', () => {
  it('resolves all SUPPORTED_ANIMALS to a sprite', () => {
    for (const animal of SUPPORTED_ANIMALS) {
      const sprite = getSprite(animal);
      expect(sprite).toBeDefined();
      expect(sprite.name).toBeTruthy();
    }
  });

  it('returns a fallback sprite for unknown animal', () => {
    const sprite = getSprite('nonexistent_animal_xyz');
    expect(sprite).toBeDefined();
    expect(sprite.name).toBeTruthy();
    expect(sprite.states.idle).toBeDefined();
  });
});

describe('sprite data integrity', () => {
  const allSprites = getAllSprites();

  for (const [animalKey, sprite] of Object.entries(allSprites)) {
    describe(`sprite: ${animalKey}`, () => {
      it('has a name', () => {
        expect(sprite.name).toBeTruthy();
        expect(typeof sprite.name).toBe('string');
      });

      it('has an emoji', () => {
        expect(sprite.emoji).toBeTruthy();
        expect(typeof sprite.emoji).toBe('string');
      });

      it('has a palette with 1 to 15 colors', () => {
        expect(sprite.palette.length).toBeGreaterThanOrEqual(1);
        expect(sprite.palette.length).toBeLessThanOrEqual(15);
      });

      it('has an idle state with at least 2 frames', () => {
        expect(sprite.states.idle).toBeDefined();
        expect(sprite.states.idle.length).toBeGreaterThanOrEqual(2);
      });

      it('has frames that are exactly 16 strings of 16 chars', () => {
        for (const frames of Object.values(sprite.states)) {
          if (!frames) continue;
          for (const frame of frames) {
            expect(frame.length).toBe(16);
            for (const row of frame) {
              expect(row.length).toBe(16);
            }
          }
        }
      });

      it('uses only valid hex digits (0-9, a-f) in frames', () => {
        const validHex = /^[0-9a-f]+$/;
        for (const frames of Object.values(sprite.states)) {
          if (!frames) continue;
          for (const frame of frames) {
            for (const row of frame) {
              expect(row).toMatch(validHex);
            }
          }
        }
      });

      it('has all known animation states (or falls back to idle)', () => {
        for (const state of ALL_STATES) {
          const frames = sprite.states[state] ?? sprite.states.idle;
          expect(frames).toBeDefined();
          expect(frames.length).toBeGreaterThanOrEqual(1);
        }
      });
    });
  }
});

describe('getAllSprites', () => {
  it('returns an object with keys for each animal', () => {
    const allSprites = getAllSprites();
    expect(typeof allSprites).toBe('object');
    expect(Object.keys(allSprites).length).toBeGreaterThanOrEqual(10);
  });
});
