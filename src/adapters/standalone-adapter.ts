import { spawn } from 'child_process';
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

      if (platform === 'darwin') {
        return this.openMacOS(renderCmd);
      } else if (platform === 'win32') {
        return this.openWindows(renderCmd);
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
}
