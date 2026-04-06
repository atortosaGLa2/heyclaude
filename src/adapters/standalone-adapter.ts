import { spawn } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import type { TerminalAdapter } from './terminal-adapter.js';

export class StandaloneAdapter implements TerminalAdapter {
  name = 'standalone';
  private childPid: number | null = null;

  isAvailable(): boolean {
    return true; // fallback adapter, always available
  }

  open(renderCmd: string): boolean {
    try {
      const platform = process.platform;
      const isWSL = platform === 'linux' &&
        (() => { try { return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft'); } catch { return false; } })();

      if (platform === 'darwin') {
        return this.openMacOS(renderCmd);
      } else if (platform === 'win32') {
        return this.openWindows(renderCmd);
      } else if (isWSL) {
        return this.openWSL(renderCmd);
      } else {
        return this.openLinux(renderCmd);
      }
    } catch {
      return false;
    }
  }

  close(): void {
    if (this.childPid !== null) {
      try {
        process.kill(this.childPid, 'SIGTERM');
      } catch { /* process already gone */ }
      this.childPid = null;
    }
  }

  isRunning(): boolean {
    if (this.childPid === null) return false;
    try {
      process.kill(this.childPid, 0);
      return true;
    } catch {
      this.childPid = null;
      return false;
    }
  }

  private openMacOS(renderCmd: string): boolean {
    const termProgram = process.env.TERM_PROGRAM;

    if (termProgram === 'iTerm.app') {
      // Use osascript to open a new iTerm2 tab/window
      const script = `tell application "iTerm2"
        create window with default profile command "${renderCmd.replace(/"/g, '\\"')}"
      end tell`;
      const child = spawn('osascript', ['-e', script], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      if (child.pid) this.childPid = child.pid;
      return true;
    }

    // Default: open Terminal.app
    const child = spawn('open', ['-a', 'Terminal.app', '--args', '-e', renderCmd], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    if (child.pid) this.childPid = child.pid;
    return true;
  }

  private openWindows(renderCmd: string): boolean {
    const child = spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', renderCmd], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    if (child.pid) this.childPid = child.pid;
    return true;
  }

  private openWSL(daemonUrl: string): boolean {
    const ps = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';

    // Write popup HTML to a Windows temp file — avoids Edge profile/sync/cache issues
    const tmpWsl  = '/mnt/c/Users/Public/heyclaude-popup.html';
    const tmpWin  = 'C:\\Users\\Public\\heyclaude-popup.html';
    const popupSrc = this.getPopupHtml(daemonUrl);
    try { writeFileSync(tmpWsl, popupSrc, 'utf8'); } catch { /* fallback below */ }

    const edgePaths = [
      '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
    ];
    const winEdgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];

    for (let i = 0; i < edgePaths.length; i++) {
      if (!existsSync(edgePaths[i])) continue;
      try {
        const fileUrl = `file:///${tmpWin.replace(/\\/g, '/')}`;
        const args = [
          `--app=${fileUrl}`,
          `--window-size=164,260`,
          `--window-position=1700,800`,
          `--no-first-run`,
          `--allow-file-access-from-files`,
          `--disable-web-security`,
        ].map(a => `'${a}'`).join(',');
        const psCmd = `Start-Process '${winEdgePaths[i]}' -ArgumentList ${args}`;
        const child = spawn(ps, ['-NoProfile', '-Command', psCmd], {
          detached: true, stdio: 'ignore',
        });
        child.unref();
        if (child.pid) { this.childPid = child.pid; return true; }
      } catch { continue; }
    }

    // Fallback: open full web UI in default browser
    try {
      const child = spawn(ps, ['-NoProfile', '-Command', `Start-Process '${daemonUrl}'`], {
        detached: true, stdio: 'ignore',
      });
      child.unref();
      if (child.pid) { this.childPid = child.pid; return true; }
    } catch { /* ignore */ }

    return false;
  }

  private openLinux(renderCmd: string): boolean {
    // Try common terminal emulators in order of preference
    const terminals = [
      { cmd: 'x-terminal-emulator', args: ['-e', renderCmd] },
      { cmd: 'gnome-terminal', args: ['--', 'sh', '-c', renderCmd] },
      { cmd: 'xterm', args: ['-e', renderCmd] },
    ];

    for (const term of terminals) {
      try {
        const child = spawn(term.cmd, term.args, {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        if (child.pid) {
          this.childPid = child.pid;
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  private getPopupHtml(daemonUrl: string): string {
    const candidates = [
      resolve(__dirname, '..', 'electron', 'popup.html'),
      resolve(__dirname, 'electron', 'popup.html'),
    ];
    let html = '';
    for (const p of candidates) {
      try { html = readFileSync(p, 'utf8'); break; } catch { continue; }
    }
    if (!html) return `<html><body style="background:#111;color:#fff">popup.html not found</body></html>`;

    // Inject daemon URL so the page doesn't need query params
    const port = new URL(daemonUrl).port || '7337';
    html = html.replace(
      "var HTTP_PORT = params.get('daemonPort') || '7337';",
      `var HTTP_PORT = '${port}';`
    ).replace(
      "var WS_PORT = params.get('wsPort') || '7338';",
      `var WS_PORT = '${String(Number(port) + 1)}';`
    );
    return html;
  }
}
