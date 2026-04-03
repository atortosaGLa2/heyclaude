/**
 * Electron popup window for heyclaude mascot.
 *
 * Frameless, transparent, always-on-top mini window
 * that connects to the daemon's WebSocket for state updates.
 */

import { app, BrowserWindow, Menu, screen } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WINDOW_SIZE = 200;
const DAEMON_PORT = parseInt(process.env.HEYCLAUDE_DAEMON_PORT ?? '7337', 10);
const WS_PORT = parseInt(process.env.HEYCLAUDE_WS_PORT ?? '7338', 10);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    x: screenWidth - WINDOW_SIZE - 20,
    y: screenHeight - WINDOW_SIZE - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Allow clicks to pass through transparent areas
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Load the popup HTML — check dist first, then src
  let popupPath = join(__dirname, 'popup.html');
  if (!existsSync(popupPath)) {
    popupPath = join(__dirname, '..', '..', 'src', 'electron', 'popup.html');
  }
  mainWindow.loadFile(popupPath, {
    query: {
      daemonPort: String(DAEMON_PORT),
      wsPort: String(WS_PORT),
    },
  });

  // Context menu on right-click
  mainWindow.webContents.on('context-menu', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Move to Corner',
        submenu: [
          {
            label: 'Bottom Right',
            click: () => {
              mainWindow?.setPosition(screenWidth - WINDOW_SIZE - 20, screenHeight - WINDOW_SIZE - 20);
            },
          },
          {
            label: 'Bottom Left',
            click: () => {
              mainWindow?.setPosition(20, screenHeight - WINDOW_SIZE - 20);
            },
          },
          {
            label: 'Top Right',
            click: () => {
              mainWindow?.setPosition(screenWidth - WINDOW_SIZE - 20, 20);
            },
          },
          {
            label: 'Top Left',
            click: () => {
              mainWindow?.setPosition(20, 20);
            },
          },
        ],
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ]);
    contextMenu.popup();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
