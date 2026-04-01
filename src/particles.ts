/**
 * Particle effect system for heyclaude
 *
 * Renders text-based particle overlays on top of sprite frames.
 * Each animation state can have its own particle configuration.
 */

import type { AnimationState } from './types.js';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  life: number;     // remaining frames
  maxLife: number;
  color?: string;   // hex color override (otherwise uses theme accent)
}

export interface ParticleConfig {
  chars: string[];
  count: number;        // particles per spawn
  spawnRate: number;     // spawn every N frames
  lifetime: number;      // frames before particle dies
  gravity: number;       // vertical acceleration per frame
  speed: number;         // initial speed magnitude
  direction: 'up' | 'down' | 'left' | 'right' | 'radial' | 'random';
  region: { x0: number; y0: number; x1: number; y1: number }; // spawn area
  color?: string;        // hex color for particles
}

// Particle configs per animation state
const PARTICLE_CONFIGS: Partial<Record<AnimationState, ParticleConfig>> = {
  success: {
    chars: ['✦', '✧', '⋆', '*', '·'],
    count: 2,
    spawnRate: 2,
    lifetime: 12,
    gravity: -0.15,
    speed: 0.5,
    direction: 'up',
    region: { x0: 2, y0: 1, x1: 14, y1: 4 },
    color: '#ffcc33',
  },
  error: {
    chars: ['╎', '┊', '·', '.'],
    count: 1,
    spawnRate: 3,
    lifetime: 10,
    gravity: 0.2,
    speed: 0.3,
    direction: 'down',
    region: { x0: 3, y0: 0, x1: 13, y1: 2 },
    color: '#ff6644',
  },
  thinking: {
    chars: ['○', '◌', '·', '°'],
    count: 1,
    spawnRate: 5,
    lifetime: 15,
    gravity: -0.1,
    speed: 0.2,
    direction: 'up',
    region: { x0: 10, y0: 0, x1: 15, y1: 3 },
    color: '#aaaacc',
  },
  coding: {
    chars: ['<', '>', '{', '}', ';', '/'],
    count: 1,
    spawnRate: 4,
    lifetime: 8,
    gravity: 0.05,
    speed: 0.4,
    direction: 'random',
    region: { x0: 0, y0: 2, x1: 16, y1: 6 },
    color: '#7c6af7',
  },
  searching: {
    chars: ['─', '━', '═', '—'],
    count: 1,
    spawnRate: 3,
    lifetime: 6,
    gravity: 0,
    speed: 0.8,
    direction: 'right',
    region: { x0: 0, y0: 3, x1: 4, y1: 7 },
    color: '#44aaff',
  },
  executing: {
    chars: ['⚡', '╋', '┼', '·'],
    count: 2,
    spawnRate: 2,
    lifetime: 5,
    gravity: 0,
    speed: 0.6,
    direction: 'radial',
    region: { x0: 4, y0: 2, x1: 12, y1: 8 },
    color: '#ffaa22',
  },
  browsing: {
    chars: ['~', '≈', '·'],
    count: 1,
    spawnRate: 6,
    lifetime: 10,
    gravity: 0,
    speed: 0.3,
    direction: 'right',
    region: { x0: 0, y0: 4, x1: 3, y1: 6 },
    color: '#44ccaa',
  },
  mcp: {
    chars: ['◆', '◇', '·', '⬡'],
    count: 1,
    spawnRate: 3,
    lifetime: 10,
    gravity: 0,
    speed: 0.3,
    direction: 'radial',
    region: { x0: 3, y0: 2, x1: 13, y1: 8 },
    color: '#cc66ff',
  },
  skill: {
    chars: ['★', '☆', '·'],
    count: 1,
    spawnRate: 4,
    lifetime: 8,
    gravity: -0.1,
    speed: 0.4,
    direction: 'up',
    region: { x0: 4, y0: 0, x1: 12, y1: 3 },
    color: '#ffdd44',
  },
};

export class ParticleEngine {
  private particles: Particle[] = [];
  private frameCount = 0;
  private currentState: AnimationState = 'idle';

  setState(state: AnimationState): void {
    if (state !== this.currentState) {
      this.currentState = state;
      this.particles = [];
      this.frameCount = 0;
    }
  }

  tick(): void {
    this.frameCount++;

    const config = PARTICLE_CONFIGS[this.currentState];
    if (config && this.frameCount % config.spawnRate === 0) {
      this.spawn(config);
    }

    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += config?.gravity ?? 0;
      p.life--;

      // Remove dead or out-of-bounds particles
      if (p.life <= 0 || p.x < -1 || p.x > 17 || p.y < -1 || p.y > 9) {
        this.particles.splice(i, 1);
      }
    }
  }

  private spawn(config: ParticleConfig): void {
    for (let i = 0; i < config.count; i++) {
      const { x0, y0, x1, y1 } = config.region;
      // Spawn positions in terminal coordinates (x: 0-15 cols, y: 0-7 rows)
      const x = x0 + Math.random() * (x1 - x0);
      const y = (y0 + Math.random() * (y1 - y0)) / 2; // divide by 2 for half-block rows

      let vx = 0;
      let vy = 0;
      const s = config.speed;

      switch (config.direction) {
        case 'up':
          vx = (Math.random() - 0.5) * s * 0.5;
          vy = -s;
          break;
        case 'down':
          vx = (Math.random() - 0.5) * s * 0.5;
          vy = s;
          break;
        case 'left':
          vx = -s;
          vy = (Math.random() - 0.5) * s * 0.3;
          break;
        case 'right':
          vx = s;
          vy = (Math.random() - 0.5) * s * 0.3;
          break;
        case 'radial': {
          const angle = Math.random() * Math.PI * 2;
          vx = Math.cos(angle) * s;
          vy = Math.sin(angle) * s;
          break;
        }
        case 'random':
          vx = (Math.random() - 0.5) * s * 2;
          vy = (Math.random() - 0.5) * s * 2;
          break;
      }

      this.particles.push({
        x,
        y,
        vx,
        vy,
        char: config.chars[Math.floor(Math.random() * config.chars.length)],
        life: config.lifetime + Math.floor(Math.random() * 4),
        maxLife: config.lifetime,
        color: config.color,
      });
    }
  }

  /**
   * Get active particles for rendering overlay.
   * Returns particles with terminal-space coordinates (col: 0-15, row: 0-7).
   */
  getParticles(): ReadonlyArray<Particle> {
    return this.particles;
  }

  /**
   * Render particle overlay as an array of {col, row, char, color} entries
   * that the renderer can composite on top of the sprite frame.
   */
  getOverlay(): Array<{ col: number; row: number; char: string; color?: string; opacity: number }> {
    return this.particles
      .filter(p => p.x >= 0 && p.x < 16 && p.y >= 0 && p.y < 8)
      .map(p => ({
        col: Math.floor(p.x),
        row: Math.floor(p.y),
        char: p.char,
        color: p.color,
        opacity: p.life / p.maxLife, // fade as particle dies
      }));
  }

  hasParticles(): boolean {
    return PARTICLE_CONFIGS[this.currentState] !== undefined;
  }

  clear(): void {
    this.particles = [];
    this.frameCount = 0;
  }
}
