import { TmuxAdapter } from './tmux-adapter.js';
import { StandaloneAdapter } from './standalone-adapter.js';
import type { TerminalAdapter } from './terminal-adapter.js';

export type { TerminalAdapter };

export function selectAdapter(): TerminalAdapter {
  const tmux = new TmuxAdapter();
  if (tmux.isAvailable()) return tmux;
  return new StandaloneAdapter();
}
