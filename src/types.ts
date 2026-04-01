export type AnimationState =
  | 'idle'
  | 'thinking'
  | 'coding'
  | 'reading'
  | 'searching'
  | 'browsing'
  | 'executing'
  | 'planning'
  | 'waiting'
  | 'success'
  | 'error'
  | 'mcp'
  | 'skill'
  | 'sleeping'
  | 'greeting';

export interface HookEvent {
  state: AnimationState;
  label?: string;
  tool?: string;
}

export interface DaemonState {
  animal: string;
  state: AnimationState;
  label: string;
  sessionId: string;
}
