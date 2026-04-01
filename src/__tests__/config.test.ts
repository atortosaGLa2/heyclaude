import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs before importing the module under test
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

import { loadConfig } from '../config.js';
import { existsSync, readFileSync } from 'fs';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    // Clear all HEYCLAUDE_ env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('HEYCLAUDE_')) {
        delete process.env[key];
      }
    }
    // Default: no config file
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns correct defaults when no config file or env vars exist', () => {
    const config = loadConfig();
    expect(config.animal).toBe('auto');
    expect(config.theme).toBe('claude');
    expect(config.position).toBe('right');
    expect(config.width).toBe(22);
    expect(config.particles).toBe(true);
    expect(config.daemonPort).toBe(7337);
    expect(config.wsPort).toBe(7338);
    expect(config.webPort).toBe(7339);
  });

  it('applies env var string overrides', () => {
    process.env.HEYCLAUDE_ANIMAL = 'fox';
    process.env.HEYCLAUDE_THEME = 'dark';
    process.env.HEYCLAUDE_POSITION = 'left';

    const config = loadConfig();
    expect(config.animal).toBe('fox');
    expect(config.theme).toBe('dark');
    expect(config.position).toBe('left');
  });

  it('parses boolean env vars: "true" becomes true', () => {
    process.env.HEYCLAUDE_PARTICLES = 'true';
    const config = loadConfig();
    expect(config.particles).toBe(true);
  });

  it('parses boolean env vars: "false" becomes false', () => {
    process.env.HEYCLAUDE_PARTICLES = 'false';
    const config = loadConfig();
    expect(config.particles).toBe(false);
  });

  it('parses boolean env vars: "1" becomes true', () => {
    process.env.HEYCLAUDE_PARTICLES = '1';
    const config = loadConfig();
    expect(config.particles).toBe(true);
  });

  it('parses valid number env vars', () => {
    process.env.HEYCLAUDE_WIDTH = '30';
    process.env.HEYCLAUDE_DAEMON_PORT = '9000';

    const config = loadConfig();
    expect(config.width).toBe(30);
    expect(config.daemonPort).toBe(9000);
  });

  it('ignores invalid number env vars and uses default', () => {
    process.env.HEYCLAUDE_WIDTH = 'notanumber';
    const config = loadConfig();
    expect(config.width).toBe(22); // default
  });

  it('CLI overrides take precedence over env vars', () => {
    process.env.HEYCLAUDE_ANIMAL = 'fox';

    const config = loadConfig({ animal: 'dragon' });
    expect(config.animal).toBe('dragon');
  });

  it('CLI overrides take precedence over config file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ animal: 'cat' }));

    const config = loadConfig({ animal: 'robot' });
    expect(config.animal).toBe('robot');
  });

  it('config file values override defaults', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ animal: 'panda', width: 28 }));

    const config = loadConfig();
    expect(config.animal).toBe('panda');
    expect(config.width).toBe(28);
  });

  it('env vars override config file values', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ animal: 'cat' }));
    process.env.HEYCLAUDE_ANIMAL = 'owl';

    const config = loadConfig();
    expect(config.animal).toBe('owl');
  });
});
