import { spawn } from 'child_process';
import { resolve, join, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { TerminalAdapter } from './terminal-adapter.js';

function isWSL(): boolean {
  if (process.platform !== 'linux') return false;
  try { return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft'); } catch { return false; }
}

function hasDisplay(): boolean {
  return !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');

export class ElectronAdapter implements TerminalAdapter {
  name = 'electron-popup';
  private childPid: number | null = null;

  isAvailable(): boolean {
    try {
      if (isWSL()) return false; // WSL: use Edge app mode instead (more stable than Electron/WSLg)
      return this.getElectronBin() !== null;
    } catch {
      return false;
    }
  }

  open(_renderCmd: string): boolean {
    try {
      const electronBin = this.getElectronBin();
      if (!electronBin) return false;

      // Use the CJS entry point (Electron doesn't support ESM main process)
      const distMain = join(ROOT, 'dist', 'electron', 'main.cjs');
      const srcMain = join(ROOT, 'src', 'electron', 'main.cjs');
      const mainScript = existsSync(distMain) ? distMain : srcMain;

      const child = spawn(electronBin, [mainScript], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          HEYCLAUDE_DAEMON_PORT: process.env.HEYCLAUDE_DAEMON_PORT ?? '7337',
          HEYCLAUDE_WS_PORT: process.env.HEYCLAUDE_WS_PORT ?? '7338',
        },
      });
      child.unref();

      if (child.pid) {
        this.childPid = child.pid;
        return true;
      }
      return false;
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

  private getElectronBin(): string | null {
    const electronBin = join(ROOT, 'node_modules', '.bin', 'electron');
    if (existsSync(electronBin)) return electronBin;
    return null;
  }
}
