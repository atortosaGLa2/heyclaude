import { animalFromSessionId } from './sprites/index.js';
import { resolveSessionId } from './session-resolver.js';

/** Read the current Claude Code session and return its animal mascot name */
export function detectAnimal(): { animal: string; sessionId: string } {
  // Prefer process-tree-based resolution (works for multi-session)
  const sessionId = resolveSessionId() ?? 'default';
  return { sessionId, animal: animalFromSessionId(sessionId) };
}
