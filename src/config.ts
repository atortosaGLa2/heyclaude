import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

export interface HeyclaudeConfig {
  animal: string;
  theme: string;
  position: string;
  width: number;
  particles: boolean;
  daemonPort: number;
  wsPort: number;
  webPort: number;
}

const DEFAULTS: HeyclaudeConfig = {
  animal: 'auto',
  theme: 'claude',
  position: 'right',
  width: 22,
  particles: true,
  daemonPort: 7337,
  wsPort: 7338,
  webPort: 7339,
};

/**
 * Returns the configuration directory path, respecting platform conventions.
 * - macOS/Linux: XDG_CONFIG_HOME/heyclaude or ~/.config/heyclaude
 * - Windows: APPDATA/heyclaude
 */
export function getConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      return join(appData, 'heyclaude');
    }
    return join(homedir(), 'AppData', 'Roaming', 'heyclaude');
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    return join(xdg, 'heyclaude');
  }
  return join(homedir(), '.config', 'heyclaude');
}

/**
 * Returns the full path to the config file.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/** Registry file tracking all running daemon sessions */
export function getRegistryPath(): string {
  return join(getConfigDir(), 'registry.json');
}

/** Advisory lock file for registry writes */
export function getRegistryLockPath(): string {
  return join(getConfigDir(), 'registry.lock');
}

/** Directory for per-session PID files */
export function getPidDir(): string {
  return join(getConfigDir(), 'pids');
}

/** TTY → sessionId mapping file (fast lookup for hooks) */
export function getTtyMapPath(): string {
  return join(getConfigDir(), 'tty-map.json');
}

/**
 * Parse a boolean from an environment variable string.
 * "true" or "1" => true, anything else => false.
 */
function parseBoolEnv(value: string): boolean {
  return value === 'true' || value === '1';
}

/**
 * Parse an integer from an environment variable string.
 * Returns undefined if the value is not a valid integer.
 */
function parseIntEnv(value: string): number | undefined {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Read config values from environment variables.
 * Only returns keys that have corresponding env vars set.
 */
function readEnvOverrides(): Partial<HeyclaudeConfig> {
  const overrides: Partial<HeyclaudeConfig> = {};

  const animal = process.env.HEYCLAUDE_ANIMAL;
  if (animal !== undefined) overrides.animal = animal;

  const theme = process.env.HEYCLAUDE_THEME;
  if (theme !== undefined) overrides.theme = theme;

  const position = process.env.HEYCLAUDE_POSITION;
  if (position !== undefined) overrides.position = position;

  const width = process.env.HEYCLAUDE_WIDTH;
  if (width !== undefined) {
    const parsed = parseIntEnv(width);
    if (parsed !== undefined) overrides.width = parsed;
  }

  const particles = process.env.HEYCLAUDE_PARTICLES;
  if (particles !== undefined) overrides.particles = parseBoolEnv(particles);

  const daemonPort = process.env.HEYCLAUDE_DAEMON_PORT;
  if (daemonPort !== undefined) {
    const parsed = parseIntEnv(daemonPort);
    if (parsed !== undefined) overrides.daemonPort = parsed;
  }

  const wsPort = process.env.HEYCLAUDE_WS_PORT;
  if (wsPort !== undefined) {
    const parsed = parseIntEnv(wsPort);
    if (parsed !== undefined) overrides.wsPort = parsed;
  }

  const webPort = process.env.HEYCLAUDE_WEB_PORT;
  if (webPort !== undefined) {
    const parsed = parseIntEnv(webPort);
    if (parsed !== undefined) overrides.webPort = parsed;
  }

  return overrides;
}

/**
 * Read the config file from disk.
 * Returns an empty object if the file doesn't exist or can't be parsed.
 */
function readConfigFile(): Partial<HeyclaudeConfig> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Partial<HeyclaudeConfig>;
    }
    console.warn(`[heyclaude] Config file is not a JSON object, using defaults`);
    return {};
  } catch (err) {
    console.warn(`[heyclaude] Failed to parse config file at ${configPath}, using defaults`);
    return {};
  }
}

/**
 * Load the merged configuration.
 *
 * Priority (later overrides earlier):
 * 1. DEFAULTS
 * 2. Config file (if exists)
 * 3. Environment variables
 * 4. CLI flags (passed as overrides parameter)
 */
export function loadConfig(overrides?: Partial<HeyclaudeConfig>): HeyclaudeConfig {
  const fileConfig = readConfigFile();
  const envConfig = readEnvOverrides();

  return {
    ...DEFAULTS,
    ...fileConfig,
    ...envConfig,
    ...(overrides ?? {}),
  };
}

/**
 * Save config to disk, writing only non-default values.
 * Creates the config directory if it doesn't exist.
 */
export function saveConfig(config: Partial<HeyclaudeConfig>): void {
  const merged = { ...loadConfig(), ...config };

  // Only persist values that differ from defaults
  const toSave: Partial<HeyclaudeConfig> = {};
  for (const key of Object.keys(DEFAULTS) as Array<keyof HeyclaudeConfig>) {
    if (merged[key] !== DEFAULTS[key]) {
      // Use type assertion to handle the union of string | number | boolean
      (toSave as Record<string, unknown>)[key] = merged[key];
    }
  }

  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
}

/**
 * Reset configuration by deleting the config file.
 */
export function resetConfig(): void {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    unlinkSync(configPath);
  }
}
