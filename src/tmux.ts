import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PANE_NAME   = 'heyclaude';
const PANE_WIDTH  = 22;

function tmux(cmd: string): string {
  try {
    return execSync(`tmux ${cmd}`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  } catch {
    return '';
  }
}

/** Returns true if we are inside a tmux session */
export function inTmux(): boolean {
  return !!process.env.TMUX;
}

/** Returns true if the heyclaude pane already exists */
export function paneExists(): boolean {
  const out = tmux(`list-panes -a -F '#{pane_title}'`);
  return out.includes(PANE_NAME);
}

/**
 * Open a vertical split pane on the right (22 cols wide) and run
 * the heyclaude render-loop process inside it.
 * The caller script path is used to locate the built render-loop.
 */
export function openPane(renderCmd: string): boolean {
  if (!inTmux()) return false;

  // Kill existing pane if present
  closePane();

  // Create a new right split, set its title, run render-loop
  const cmd = [
    `split-window -h -l ${PANE_WIDTH}`,
    `"printf '\\\\033]2;${PANE_NAME}\\\\033\\\\\\\\'; ${renderCmd}"`,
  ].join(' ');

  const result = spawnSync('tmux', [
    'split-window', '-h', '-l', String(PANE_WIDTH),
    `printf '\\033]2;${PANE_NAME}\\033\\\\'; ${renderCmd}`,
  ], { stdio: 'inherit' });

  return result.status === 0;
}

/** Kill the heyclaude pane if it exists */
export function closePane(): void {
  // Find pane by title and kill it
  try {
    const panes = execSync(
      `tmux list-panes -a -F '#{pane_id} #{pane_title}'`,
      { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }
    ).trim().split('\n');

    for (const line of panes) {
      if (line.includes(PANE_NAME)) {
        const paneId = line.split(' ')[0];
        tmux(`kill-pane -t ${paneId}`);
      }
    }
  } catch { /* pane already gone */ }
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
