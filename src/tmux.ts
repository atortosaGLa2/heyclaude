import { TmuxAdapter } from './adapters/tmux-adapter.js';

const adapter = new TmuxAdapter();

/** Returns true if we are inside a tmux session */
export const inTmux = () => adapter.isAvailable();

/** Returns true if the heyclaude pane already exists */
export const paneExists = () => adapter.isRunning();

/** Open a vertical split pane on the right and run the render-loop */
export function openPane(renderCmd: string) { return adapter.open(renderCmd); }

/** Kill the heyclaude pane if it exists */
export function closePane() { adapter.close(); }

export { getRenderCommand } from './adapters/tmux-adapter.js';
