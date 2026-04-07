import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import type { TerminalAdapter } from './terminal-adapter.js';

const PANE_PREFIX = 'heyclaude';
const PANE_WIDTH  = 22;

function tmux(cmd: string): string {
  try {
    return execSync(`tmux ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

/** Extract pane name from render command.
 *  If command contains HEYCLAUDE_DAEMON_PORT=N, returns 'heyclaude-N' (session-specific).
 *  Otherwise returns 'heyclaude' (legacy/single-session). */
function paneNameFromCmd(renderCmd: string): string {
  const m = renderCmd.match(/HEYCLAUDE_DAEMON_PORT=(\d+)/);
  return m ? `${PANE_PREFIX}-${m[1]}` : PANE_PREFIX;
}

/** Kill tmux panes whose title exactly matches paneName */
function killPanesNamed(paneName: string): void {
  try {
    const lines = execSync(
      `tmux list-panes -a -F '#{pane_id} #{pane_title}'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim().split('\n');

    for (const line of lines) {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      const paneId = line.slice(0, spaceIdx);
      const title  = line.slice(spaceIdx + 1);
      if (title === paneName) {
        tmux(`kill-pane -t ${paneId}`);
      }
    }
  } catch { /* pane already gone */ }
}

export class TmuxAdapter implements TerminalAdapter {
  name = 'tmux';

  isAvailable(): boolean {
    return !!process.env.TMUX;
  }

  open(renderCmd: string): boolean {
    if (!this.isAvailable()) return false;

    // Kill only THIS session's pane (by unique port-based title)
    const paneName = paneNameFromCmd(renderCmd);
    killPanesNamed(paneName);

    const result = spawnSync('tmux', [
      'split-window', '-h', '-l', String(PANE_WIDTH),
      `printf '\\033]2;${paneName}\\033\\\\'; ${renderCmd}`,
    ], { stdio: 'inherit' });

    return result.status === 0;
  }

  close(): void {
    // Called by cmdStop — kill all heyclaude panes (all sessions)
    try {
      const lines = execSync(
        `tmux list-panes -a -F '#{pane_id} #{pane_title}'`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim().split('\n');

      for (const line of lines) {
        const spaceIdx = line.indexOf(' ');
        if (spaceIdx === -1) continue;
        const paneId = line.slice(0, spaceIdx);
        const title  = line.slice(spaceIdx + 1);
        if (title === PANE_PREFIX || title.startsWith(`${PANE_PREFIX}-`)) {
          tmux(`kill-pane -t ${paneId}`);
        }
      }
    } catch { /* pane already gone */ }
  }

  closeSession(daemonPort: number): void {
    killPanesNamed(`${PANE_PREFIX}-${daemonPort}`);
  }

  isRunning(): boolean {
    const out = tmux(`list-panes -a -F '#{pane_title}'`);
    return out.split('\n').some(t => t === PANE_PREFIX || t.startsWith(`${PANE_PREFIX}-`));
  }
}

/** Return the render command (uses tsx in dev, node dist in prod) */
export function getRenderCommand(rootDir: string): string {
  const distRender = join(rootDir, 'dist', 'render-loop.js');
  const srcRender  = join(rootDir, 'src',  'render-loop.ts');

  try {
    require.resolve(distRender);
    return `node "${distRender}"`;
  } catch {
    const tsx = spawnSync('which', ['tsx'], { encoding: 'utf8' });
    if (tsx.stdout.trim()) {
      return `"${tsx.stdout.trim()}" "${srcRender}"`;
    }
    return `node "${distRender}"`;
  }
}
