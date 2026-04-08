#!/usr/bin/env node
/**
 * heyclaude hook session helper
 *
 * Shared ES module imported by all hook scripts.
 * Resolves the correct daemon URL for the current Claude Code session
 * without requiring TypeScript or build artifacts.
 */

import { readFileSync, readlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

const SESSIONS_DIR   = join(homedir(), '.claude', 'sessions');
const REGISTRY_PATH  = join(homedir(), '.config', 'heyclaude', 'registry.json');
const TTY_MAP_PATH   = join(homedir(), '.config', 'heyclaude', 'tty-map.json');
const MAX_DEPTH      = 10;

// ── Process tree walking ──────────────────────────────────────────────────────

function isClaudeProcess(comm) {
  return comm === 'claude' || comm === 'claude-code' || comm.endsWith('/claude');
}

function findClaudePidLinux(startPid) {
  let pid = startPid;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (!pid || pid <= 1) return null;
    try {
      const comm = readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
      if (isClaudeProcess(comm)) return pid;
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      const m = status.match(/^PPid:\s+(\d+)/m);
      pid = m ? parseInt(m[1], 10) : 0;
    } catch {
      return null;
    }
  }
  return null;
}

function findClaudePidDarwin(startPid) {
  let pid = startPid;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (!pid || pid <= 1) return null;
    try {
      const comm = execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], {
        encoding: 'utf8', timeout: 1000,
      }).trim();
      if (isClaudeProcess(comm)) return pid;
      const ppidStr = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
        encoding: 'utf8', timeout: 1000,
      }).trim();
      pid = parseInt(ppidStr, 10);
    } catch {
      return null;
    }
  }
  return null;
}

function findClaudePid() {
  const start = process.ppid;
  if (process.platform === 'linux') return findClaudePidLinux(start);
  if (process.platform === 'darwin') return findClaudePidDarwin(start);
  return null;
}

// ── Registry lookup ───────────────────────────────────────────────────────────

function readRegistry() {
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    return {};
  }
}

function readTtyMap() {
  try {
    const raw = readFileSync(TTY_MAP_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    return {};
  }
}

function getCurrentTty() {
  try {
    const tty = readlinkSync('/proc/self/fd/0');
    if (tty.startsWith('/dev/pts/') || tty.startsWith('/dev/tty')) return tty;
    return null;
  } catch { return null; }
}

// ── Public export ─────────────────────────────────────────────────────────────

/**
 * Resolve the daemon /event URL for the current Claude Code session.
 *
 * Resolution order:
 * 1. CLAUDE_SESSION_ID env var → registry lookup
 * 2. Process tree walk → session file → registry lookup
 * 3. 'default' daemon fallback (autostart / single-session mode)
 * 4. null (no daemon running, hook should skip silently)
 */
export function resolveEventUrl() {
  try {
    let sessionId = process.env.CLAUDE_SESSION_ID;

    if (!sessionId || sessionId === 'default') {
      // 1. TTY-based lookup (fastest, most reliable)
      const tty = getCurrentTty();
      if (tty) {
        const ttyMap = readTtyMap();
        if (ttyMap[tty] && ttyMap[tty] !== 'default') {
          sessionId = ttyMap[tty];
        }
      }
    }

    if (!sessionId || sessionId === 'default') {
      // 2. Process tree walk fallback
      const claudePid = findClaudePid();
      if (claudePid) {
        try {
          const sessionFile = join(SESSIONS_DIR, `${claudePid}.json`);
          const data = JSON.parse(readFileSync(sessionFile, 'utf8'));
          sessionId = data.sessionId;
        } catch { /* session file unreadable */ }
      }
    }

    const registry = readRegistry();

    // Try session-specific daemon
    if (sessionId && registry[sessionId]) {
      return `http://localhost:${registry[sessionId].daemonPort}/event`;
    }

    // Fall back to 'default' daemon (autostart / backward compat)
    if (registry['default']) {
      return `http://localhost:${registry['default'].daemonPort}/event`;
    }

    return null;
  } catch {
    return null;
  }
}
