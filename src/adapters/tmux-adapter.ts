import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import type { TerminalAdapter } from './terminal-adapter.js';

const PANE_NAME  = 'heyclaude';
const PANE_WIDTH = 22;

function tmux(cmd: string): string {
  try {
    return execSync(`tmux ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

export class TmuxAdapter implements TerminalAdapter {
  name = 'tmux';

  isAvailable(): boolean {
    return !!process.env.TMUX;
  }

  open(renderCmd: string): boolean {
    if (!this.isAvailable()) return false;

    // Kill existing pane if present
    this.close();

    // Create a new right split, set its title, run render-loop
    const result = spawnSync('tmux', [
      'split-window', '-h', '-l', String(PANE_WIDTH),
      `printf '\\033]2;${PANE_NAME}\\033\\\\'; ${renderCmd}`,
    ], { stdio: 'inherit' });

    return result.status === 0;
  }

  close(): void {
    try {
      const panes = execSync(
        `tmux list-panes -a -F '#{pane_id} #{pane_title}'`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim().split('\n');

      for (const line of panes) {
        if (line.includes(PANE_NAME)) {
          const paneId = line.split(' ')[0];
          tmux(`kill-pane -t ${paneId}`);
        }
      }
    } catch { /* pane already gone */ }
  }

  isRunning(): boolean {
    const out = tmux(`list-panes -a -F '#{pane_title}'`);
    return out.includes(PANE_NAME);
  }
}

/** Return the render command (uses tsx in dev, node dist in prod) */
export function getRenderCommand(rootDir: string): string {
  const distRender = join(rootDir, 'dist', 'render-loop.js');
  const srcRender  = join(rootDir, 'src',  'render-loop.ts');

  // Prefer compiled dist; fall back to tsx for dev
  try {
    require.resolve(distRender);
    return `node "${distRender}"`;
  } catch {
    // Try tsx
    const tsx = spawnSync('which', ['tsx'], { encoding: 'utf8' });
    if (tsx.stdout.trim()) {
      return `"${tsx.stdout.trim()}" "${srcRender}"`;
    }
    return `node "${distRender}"`;
  }
}
