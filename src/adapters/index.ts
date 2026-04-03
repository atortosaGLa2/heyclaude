import { TmuxAdapter } from './tmux-adapter.js';
import { StandaloneAdapter } from './standalone-adapter.js';
import { ElectronAdapter } from './electron-adapter.js';
import type { TerminalAdapter } from './terminal-adapter.js';

export type { TerminalAdapter };

export type AdapterMode = 'terminal' | 'popup' | 'web';

export function selectAdapter(mode?: AdapterMode): TerminalAdapter {
  if (mode === 'popup') {
    const electron = new ElectronAdapter();
    if (electron.isAvailable()) return electron;
    console.warn('[heyclaude] Electron not available, falling back to terminal mode');
  }

  const tmux = new TmuxAdapter();
  if (tmux.isAvailable()) return tmux;
  return new StandaloneAdapter();
}
