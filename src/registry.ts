/**
 * heyclaude session registry
 *
 * Tracks all running daemon instances (one per Claude Code session).
 * Registry file: ~/.config/heyclaude/registry.json
 * Lock file:     ~/.config/heyclaude/registry.lock
 */

import {
  readFileSync, writeFileSync, mkdirSync,
  openSync, writeSync, closeSync, unlinkSync,
} from 'fs';
import { readlinkSync } from 'fs';
import { createServer } from 'net';
import { getConfigDir, getRegistryPath, getRegistryLockPath, getTtyMapPath } from './config.js';

export interface RegistryEntry {
  sessionId: string;
  daemonPort: number;
  wsPort: number;
  pid: number;
  startedAt: string;
  animal?: string;
}

export type Registry = Record<string, RegistryEntry>;

// ── Internal helpers ──────────────────────────────────────────────────────────

function readRegistryRaw(): Registry {
  try {
    const raw = readFileSync(getRegistryPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Registry;
    }
    return {};
  } catch {
    return {};
  }
}

function writeRegistryRaw(registry: Registry): void {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS   = 50;

async function acquireLock(): Promise<() => void> {
  const lockPath = getRegistryLockPath();
  mkdirSync(getConfigDir(), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return () => { try { unlinkSync(lockPath); } catch { /* already gone */ } };
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
      // Check if lock holder is still alive
      try {
        const holder = parseInt(readFileSync(lockPath, 'utf8'));
        process.kill(holder, 0); // throws ESRCH if dead
      } catch {
        try { unlinkSync(lockPath); } catch { /* */ }
        continue; // retry immediately
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
  throw new Error('[heyclaude] Could not acquire registry lock (timeout after 5s)');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read, modify, and write the registry under an exclusive advisory lock.
 * The callback receives the registry object and may mutate it in place.
 */
export async function withRegistry<T>(fn: (registry: Registry) => T | Promise<T>): Promise<T> {
  const release = await acquireLock();
  try {
    const registry = readRegistryRaw();
    const result = await fn(registry);
    writeRegistryRaw(registry);
    return result;
  } finally {
    release();
  }
}

/** Fast unlocked read — for hooks that just need to look up a port */
export function readRegistry(): Registry {
  return readRegistryRaw();
}

/** Check if a TCP port is free on 127.0.0.1 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find a free (daemonPort, wsPort) pair.
 * Scans from base upward in steps of `step`, avoiding ports already in registry.
 * Must be called inside withRegistry() to be race-condition safe.
 */
export async function allocatePortPair(
  registry: Registry,
  base = 7337,
  step = 100,
): Promise<{ daemonPort: number; wsPort: number }> {
  const used = new Set<number>();
  for (const entry of Object.values(registry)) {
    used.add(entry.daemonPort);
    used.add(entry.wsPort);
  }

  let port = base;
  for (let i = 0; i < 50; i++) {
    if (!used.has(port) && !used.has(port + 1)) {
      const [httpFree, wsFree] = await Promise.all([isPortFree(port), isPortFree(port + 1)]);
      if (httpFree && wsFree) return { daemonPort: port, wsPort: port + 1 };
    }
    port += step;
  }
  throw new Error('[heyclaude] Could not find a free port pair (tried 50 candidates)');
}

/** Add or update a session entry. Called by daemon at startup. */
export async function registerSession(entry: RegistryEntry): Promise<void> {
  await withRegistry((r) => { r[entry.sessionId] = entry; });
}

/** Remove a session entry. Called by daemon at exit.
 *  Also prunes any TTY map entries pointing to this session. */
export async function unregisterSession(sessionId: string): Promise<void> {
  await withRegistry((r) => { delete r[sessionId]; });
  // Clean up all TTY → sessionId entries for this session
  const map = readTtyMapRaw();
  let changed = false;
  for (const [tty, sid] of Object.entries(map)) {
    if (sid === sessionId) { delete map[tty]; changed = true; }
  }
  if (changed) writeTtyMap(map);
}

/** Fast lookup without locking. Returns null if session not found. */
export function lookupSession(sessionId: string): RegistryEntry | null {
  return readRegistryRaw()[sessionId] ?? null;
}

// ── TTY → session mapping (fast hook lookup) ──────────────────────────────────

type TtyMap = Record<string, string>; // tty path → sessionId

function readTtyMapRaw(): TtyMap {
  try {
    const raw = readFileSync(getTtyMapPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
  } catch { return {}; }
}

function writeTtyMap(map: TtyMap): void {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getTtyMapPath(), JSON.stringify(map, null, 2) + '\n', 'utf8');
}

/** Get the TTY path for the current process (/dev/pts/N or similar). Returns null if unavailable. */
export function getCurrentTty(): string | null {
  try {
    const tty = readlinkSync('/proc/self/fd/0');
    // Only accept real terminal devices, not /dev/null or pipes
    if (tty.startsWith('/dev/pts/') || tty.startsWith('/dev/tty')) return tty;
    return null;
  } catch { return null; }
}

/** Write the TTY → sessionId mapping for the current process's TTY. */
export function registerTty(tty: string, sessionId: string): void {
  const map = readTtyMapRaw();
  map[tty] = sessionId;
  writeTtyMap(map);
}

/** Remove a TTY entry (called on stop). */
export function unregisterTty(tty: string): void {
  const map = readTtyMapRaw();
  delete map[tty];
  writeTtyMap(map);
}

/** Look up a session ID from a TTY path. Returns null if not found. */
export function lookupSessionByTty(tty: string): string | null {
  return readTtyMapRaw()[tty] ?? null;
}

/** Remove registry entries whose daemon process is no longer alive. */
export async function pruneStaleEntries(): Promise<void> {
  await withRegistry((r) => {
    for (const [sessionId, entry] of Object.entries(r)) {
      try {
        process.kill(entry.pid, 0); // no-op if alive, throws if dead
      } catch {
        delete r[sessionId];
      }
    }
  });
}
