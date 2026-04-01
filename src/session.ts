import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { animalFromSessionId } from './sprites/index.js';

const SESSIONS_DIR = join(homedir(), '.claude', 'sessions');

interface SessionFile {
  sessionId?: string;
  pid?: number;
  startedAt?: number;
}

/** Read the most recent Claude Code session and return its animal mascot name */
export function detectAnimal(): { animal: string; sessionId: string } {
  try {
    const files = readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const full = join(SESSIONS_DIR, f);
        const mtime = (() => {
          try { return readFileSync(full).toString(); } catch { return ''; }
        })();
        return { file: full, raw: mtime };
      })
      .filter(f => f.raw)
      .map(f => {
        try {
          const data: SessionFile = JSON.parse(f.raw);
          return { sessionId: data.sessionId ?? '', startedAt: data.startedAt ?? 0 };
        } catch {
          return null;
        }
      })
      .filter((s): s is { sessionId: string; startedAt: number } => s !== null && !!s.sessionId)
      .sort((a, b) => b.startedAt - a.startedAt);

    if (files.length > 0) {
      const { sessionId } = files[0];
      return { sessionId, animal: animalFromSessionId(sessionId) };
    }
  } catch {
    // sessions dir missing or unreadable
  }

  // Fallback: use a fixed animal from env or default
  const fallbackId = process.env.CLAUDE_SESSION_ID ?? 'default';
  return { sessionId: fallbackId, animal: animalFromSessionId(fallbackId) };
}
