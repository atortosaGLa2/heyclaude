/**
 * heyclaude session resolver
 *
 * Walks the process tree to find the ancestor Claude Code process,
 * then reads its session file to get the session ID.
 *
 * Works on Linux/WSL (via /proc) and macOS (via ps).
 */

import { readFileSync, readlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { readRegistry, lookupSessionByTty } from './registry.js';

const SESSIONS_DIR = join(homedir(), '.claude', 'sessions');
const MAX_DEPTH = 10;

// ── Process tree walking ──────────────────────────────────────────────────────

function isClaudeProcess(comm: string): boolean {
  return comm === 'claude' || comm === 'claude-code' || comm.endsWith('/claude');
}

function findClaudePidLinux(startPid: number): number | null {
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

function findClaudePidDarwin(startPid: number): number | null {
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

/** Walk the process tree from startPid upward to find the Claude Code PID. */
export function findClaudePid(startPid = process.ppid): number | null {
  if (process.platform === 'linux') return findClaudePidLinux(startPid);
  if (process.platform === 'darwin') return findClaudePidDarwin(startPid);
  return null;
}

// ── Session ID resolution ─────────────────────────────────────────────────────

/** Read the session ID from a Claude Code session file by its PID. */
export function sessionIdFromClaudePid(claudePid: number): string | null {
  try {
    const sessionFile = join(SESSIONS_DIR, `${claudePid}.json`);
    const data = JSON.parse(readFileSync(sessionFile, 'utf8'));
    return typeof data.sessionId === 'string' ? data.sessionId : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the Claude Code session ID for the current process.
 *
 * Resolution order:
 * 1. CLAUDE_SESSION_ID env var (future-proofing / explicit override)
 * 2. TTY-based lookup (fast, reliable — set by heyclaude start)
 * 3. Process tree walk → session file
 * 4. null (caller decides the fallback)
 */
export function resolveSessionId(): string | null {
  const envId = process.env.CLAUDE_SESSION_ID;
  if (envId && envId !== 'default') return envId;

  // TTY-based lookup: the hook runs in the same TTY as Claude Code
  try {
    const tty = readlinkSync('/proc/self/fd/0');
    if (tty.startsWith('/dev/pts/') || tty.startsWith('/dev/tty')) {
      const ttySession = lookupSessionByTty(tty);
      if (ttySession && ttySession !== 'default') return ttySession;
    }
  } catch { /* TTY not available */ }

  // Fallback: process tree walk
  const claudePid = findClaudePid();
  if (!claudePid) return null;
  return sessionIdFromClaudePid(claudePid);
}

/**
 * Resolve the daemon event URL for the current session.
 *
 * Returns null if:
 * - Cannot determine session ID (not inside Claude Code)
 * - No daemon registered for this session AND no 'default' daemon running
 *
 * Falls back to the 'default' daemon if one exists — preserves backward
 * compat with autostart scenarios where heyclaude start ran before Claude.
 */
export function resolveEventUrl(): string | null {
  const sessionId = resolveSessionId();
  const registry = readRegistry();

  // Try session-specific daemon first
  if (sessionId) {
    const entry = registry[sessionId];
    if (entry) return `http://localhost:${entry.daemonPort}/event`;
  }

  // Fall back to 'default' daemon (autostart / single-session mode)
  const def = registry['default'];
  if (def) return `http://localhost:${def.daemonPort}/event`;

  return null;
}
