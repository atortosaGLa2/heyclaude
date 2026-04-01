import type { AnimationState } from './types.js';

/** Map a Claude Code tool name to an animation state */
export function toolToState(toolName: string): AnimationState {
  const t = toolName.toLowerCase();

  if (t.startsWith('mcp__'))                            return 'mcp';
  if (t === 'skill')                                    return 'skill';
  if (t === 'agent')                                    return 'planning';
  if (t === 'bash')                                     return 'executing';
  if (t === 'read')                                     return 'reading';
  if (t === 'write' || t === 'edit' || t === 'notebookedit') return 'coding';
  if (t === 'glob' || t === 'grep')                     return 'searching';
  if (t === 'webfetch' || t === 'websearch')            return 'browsing';
  if (t === 'task' || t.startsWith('task'))             return 'planning';
  if (t === 'todowrite')                                return 'planning';
  if (t === 'exitplanmode' || t === 'enterplanmode')    return 'planning';

  return 'thinking';
}

/** Map a hook event type to an animation state */
export function hookEventToState(event: string, toolName?: string): AnimationState {
  switch (event) {
    case 'PreToolUse':       return toolName ? toolToState(toolName) : 'thinking';
    case 'PostToolUse':      return 'success';
    case 'UserPromptSubmit': return 'thinking';
    case 'Stop':             return 'waiting';
    case 'PreCompact':       return 'thinking';
    default:                 return 'idle';
  }
}

/** How long each state persists before falling back to idle (ms) */
export const STATE_TIMEOUTS: Partial<Record<AnimationState, number>> = {
  success:  2000,
  error:    3000,
  thinking: 30000,
  waiting:  60000,
};

/** Frame speed (ms per frame) for each state */
export const FRAME_SPEED: Partial<Record<AnimationState, number>> = {
  idle:      600,
  waiting:   800,
  success:   200,
  error:     400,
  thinking:  500,
  coding:    250,
  executing: 200,
  searching: 400,
  browsing:  400,
  reading:   500,
  planning:  500,
  mcp:       400,
  skill:     300,
};

export function getFrameSpeed(state: AnimationState): number {
  return FRAME_SPEED[state] ?? 400;
}
