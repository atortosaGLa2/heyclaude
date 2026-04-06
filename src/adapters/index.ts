import { TmuxAdapter } from './tmux-adapter.js';
import { StandaloneAdapter } from './standalone-adapter.js';
import { ElectronAdapter } from './electron-adapter.js';
import type { TerminalAdapter } from './terminal-adapter.js';

export type { TerminalAdapter };

export type AdapterMode = 'terminal' | 'popup' | 'web';

export function selectAdapter(mode?: AdapterMode): TerminalAdapter {
  // Explicit popup request
  if (mode === 'popup') {
    const electron = new ElectronAdapter();
    if (electron.isAvailable()) return electron;
    console.warn('[heyclaude] Electron not available, falling back to auto');
  }

  // Auto-selection: Electron → tmux → standalone (which handles WSL/web/terminal per-OS)
  if (mode !== 'terminal') {
    const electron = new ElectronAdapter();
    if (electron.isAvailable()) return electron;
  }

  const tmux = new TmuxAdapter();
  if (tmux.isAvailable()) return tmux;

  return new StandaloneAdapter();
}
