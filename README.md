# heyclaude

**An animated pixel-art mascot for your Claude Code terminal sessions.**

Each Claude Code session gets a deterministic animal companion that reacts in real time to what Claude is doing — coding, reading, searching, browsing, executing, and more. Displays as a floating popup window, a tmux side-pane, or directly in your terminal.

![Node.js 18+](https://img.shields.io/badge/node-18%2B-brightgreen)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20WSL%20%7C%20Windows-blue)
![License](https://img.shields.io/badge/license-MIT-yellow)

---

## Features

- **Pixel-art sprites** rendered at 16×16 with smooth CSS scaling in popup mode
- **15 animation states** that respond to Claude Code tool usage in real time
- **Floating popup window** — transparent dark card, always on top (macOS/Linux via Electron, WSL via Microsoft Edge app-mode)
- **tmux side-pane** — inline mascot rendered in half-block terminal art
- **Standalone terminal** — fallback for environments without tmux or a display
- **Web UI** — browser-based view at `http://localhost:7337`
- **Zero-config** — installs as a Claude Code plugin with automatic hook registration
- **Session-aware** — each session deterministically maps to a unique animal

---

## Display Modes

heyclaude automatically picks the best display mode for your environment:

| Environment        | Mode                        | How it works                                               |
|--------------------|-----------------------------|------------------------------------------------------------|
| macOS              | Electron popup (default)    | Native floating window via Electron                        |
| Linux with display | Electron popup (default)    | Native floating window via Electron                        |
| WSL2 (Windows)     | Edge app-mode popup         | Writes HTML to `C:\Users\Public\`, opens Edge `--app=file://` |
| Any with tmux      | tmux side-pane              | Half-block terminal art in a split pane                    |
| Fallback           | Standalone terminal         | Opens a new terminal window                                |

The auto-selection order is: **Electron → tmux → standalone**. You can override with `--mode`.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/bta/heyclaude.git && cd heyclaude
./install.sh

# 2. Start the mascot
heyclaude start

# 3. Open Claude Code and start working — the mascot reacts to every tool call
```

To auto-start on every terminal session, add this to your `~/.bashrc` or `~/.zshrc`:

```bash
# heyclaude — start mascot in background if not already running
(sleep 1 && heyclaude start) &>/dev/null &
```

---

## Installation

### Requirements

- **Node.js 18+**
- **tmux** *(optional — for tmux pane mode on macOS/Linux)*
- **Electron** *(optional — for floating popup on macOS/Linux)*
- **Microsoft Edge** *(optional — for floating popup on WSL2)*

### macOS / Linux

```bash
git clone https://github.com/bta/heyclaude.git && cd heyclaude
./install.sh
```

The installer:
1. Runs `npm install` and compiles TypeScript (`npm run build`)
2. Copies `dist/` and `node_modules/` to `~/.claude/plugins/heyclaude/`
3. Symlinks the `heyclaude` CLI into `~/.local/bin` (no sudo needed)
4. Registers hooks in `~/.claude/settings.json`

Make sure `~/.local/bin` is on your `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### WSL2 (Windows Subsystem for Linux)

The setup is the same as Linux. When you run `heyclaude start`, the mascot appears as a small floating window using Microsoft Edge in app-mode.

**Requirements for WSL2 popup:**
- Microsoft Edge installed on Windows (usually pre-installed on Windows 10/11)
- No extra configuration needed — heyclaude detects WSL automatically

```bash
./install.sh
heyclaude start
```

The popup appears as a small 164×260 pixel card on your Windows desktop showing the animated mascot.

**Closing the popup:** Right-click the Edge icon in the taskbar → Close window, or run `heyclaude stop`.

### Windows (native)

```powershell
npm install
npm run build
node bin\heyclaude.js start
```

Register hooks manually: copy the patterns from `hooks/hooks.json` into `%APPDATA%\.claude\settings.json`, updating the paths to point at your installation directory.

---

## Usage

### Commands

```bash
heyclaude start              # Start daemon + open mascot popup/pane
heyclaude stop               # Stop daemon + close mascot
heyclaude status             # Print current state as JSON
heyclaude animal             # Show which animal this session got
heyclaude render             # Run the terminal render loop (internal use)
```

### Display Mode Flags

```bash
heyclaude start --mode auto        # Auto-detect (default)
heyclaude start --mode popup       # Force Electron popup
heyclaude start --mode tmux        # Force tmux side-pane
heyclaude start --mode terminal    # Force standalone terminal window
heyclaude start --mode web         # Daemon only — open browser manually
```

### How It Works

```
Claude Code Session
    │
    ▼
Hook events: PreToolUse, PostToolUse, UserPromptSubmit, Stop
    │  (hooks/pre-tool.js · hooks/post-tool.js · hooks/prompt.js)
    ▼
HTTP POST → Daemon (localhost:7337)
    │  Maps tool names → animation states
    ▼
WebSocket broadcast (localhost:7338)
    │
    ├── Popup window (Electron or Edge app-mode)
    ├── tmux pane (terminal half-block renderer)
    └── Web UI (http://localhost:7337)
```

---

## Animation States

The mascot reacts to every Claude Code tool call with a matching animation state.

| State       | Trigger tools / events                                | Glow color   |
|-------------|-------------------------------------------------------|--------------|
| `greeting`  | Session start                                         | Gold         |
| `idle`      | No recent activity                                    | Pink/red     |
| `thinking`  | UserPromptSubmit, unknown tools                       | Purple       |
| `coding`    | Write, Edit, NotebookEdit                             | Blue         |
| `reading`   | Read                                                  | Yellow       |
| `searching` | Glob, Grep                                            | Orange       |
| `browsing`  | WebFetch, WebSearch                                   | Cyan         |
| `executing` | Bash                                                  | Green        |
| `planning`  | Agent, TodoWrite, plan mode tools                     | Purple       |
| `waiting`   | Stop hook (Claude finished, your turn)                | Amber        |
| `success`   | PostToolUse (tool completed)                          | Green        |
| `error`     | Tool failure                                          | Red          |
| `sleeping`  | Idle for extended period                              | Slate        |

The `waiting` state shows a **"Your turn!"** speech bubble above the mascot.

---

## Sprite Gallery

heyclaude ships with 10+ hand-crafted pixel-art sprites. Your session is assigned a unique animal based on a hash of your Claude Code session ID.

| Animal    | Animal    | Animal    | Animal    |
|-----------|-----------|-----------|-----------|
| crab      | fox       | bunny     | dragon    |
| octopus   | penguin   | cat       | robot     |
| owl       | panda     | bear      | elephant  |
| ...       |           |           |           |

A generic **Claude mascot** is used as the fallback for unrecognized session animals.

---

## Configuration

### Environment Variables

| Variable                 | Default  | Description                              |
|--------------------------|----------|------------------------------------------|
| `HEYCLAUDE_ANIMAL`       | `auto`   | Force a specific sprite (`fox`, `crab`, etc.) |
| `HEYCLAUDE_THEME`        | `claude` | Color theme for terminal render mode     |
| `HEYCLAUDE_POSITION`     | `right`  | tmux pane position (`left` or `right`)   |
| `HEYCLAUDE_WIDTH`        | `22`     | tmux pane width in columns               |
| `HEYCLAUDE_DAEMON_PORT`  | `7337`   | HTTP daemon port                         |
| `HEYCLAUDE_WS_PORT`      | `7338`   | WebSocket port                           |

### Config File

Create `~/.config/heyclaude/config.json` (Linux/macOS) or `%APPDATA%\heyclaude\config.json` (Windows):

```json
{
  "animal": "fox",
  "theme": "ocean",
  "position": "right",
  "width": 22
}
```

---

## Themes

Five built-in color themes for the terminal render mode:

| Theme    | Style                                    |
|----------|------------------------------------------|
| `claude` | Dark navy with salmon + violet accents   |
| `ocean`  | Dark slate with teal + blue accents      |
| `forest` | Dark green with emerald + amber accents  |
| `neon`   | Pure black with pink + cyan accents      |
| `mono`   | Dark grey monochrome                     |

In popup mode (Electron/Edge), the theme is a fixed dark card with per-state glow effects.

---

## Web UI

The daemon serves a web UI at `http://localhost:7337`. Open it in any browser to see the animated mascot without any separate display mode. This is useful for:

- Remote SSH sessions (forward port 7337)
- Containers with no display
- Monitoring multiple sessions from a browser tab

---

## Creating Custom Sprites

Sprites are 16×16 pixel grids encoded as hex color indices. Add a new file to `src/sprites/` and register it in `src/sprites/index.ts`:

```typescript
import type { Sprite } from './types.js';

export const myAnimal: Sprite = {
  name: 'myAnimal',
  emoji: '🐾',
  palette: [
    '#ffffff',   // index 1  (hex digit '1')
    '#000000',   // index 2  (hex digit '2')
    '#ff0000',   // index 3  (hex digit '3')
    // up to 15 colors (indices 1–f)
  ],
  states: {
    idle: [
      // Frame 1: 16 strings, each 16 chars
      [
        '0000000000000000',
        '0000011111100000',
        '0001122222110000',
        // ... 13 more rows
      ],
      // Frame 2, Frame 3, ...
    ],
    // Optional: coding, thinking, etc.
    // Undefined states fall back to 'idle'
  },
};
```

Grid characters:
- `0` = transparent (no pixel drawn)
- `1`–`f` = `palette[parseInt(c, 16) - 1]`

In terminal mode, two pixel rows share one character row using the half-block technique (`▀`), so a 16×16 sprite renders as 16 columns × 8 terminal rows. In popup mode, the 16×16 canvas is scaled up with CSS `image-rendering: pixelated`.

---

## Architecture

```
~/.claude/plugins/heyclaude/
├── bin/
│   └── heyclaude.js          Entry point (symlinked to ~/.local/bin/heyclaude)
├── dist/
│   ├── cli.js                CLI commands (start, stop, status, etc.)
│   ├── daemon.js             HTTP :7337 + WebSocket :7338 server
│   ├── render-loop.js        Terminal half-block renderer
│   ├── render-corner.js      Corner popup renderer (alternative)
│   ├── session.js            Session ID → animal hash
│   ├── states.js             Tool → animation state mapping
│   ├── sprites/              Compiled sprite modules
│   ├── adapters/
│   │   ├── tmux-adapter.js       tmux split-pane management
│   │   ├── standalone-adapter.js Platform-aware popup launcher
│   │   └── electron-adapter.js   Electron floating window
│   └── electron/
│       └── popup.html        Self-contained mascot UI (served by daemon + written to disk for WSL)
├── hooks/
│   ├── hooks.json            Hook manifest registered in ~/.claude/settings.json
│   ├── pre-tool.js           PreToolUse → POST /event
│   ├── post-tool.js          PostToolUse → POST /event
│   ├── prompt.js             UserPromptSubmit / Stop → POST /event
│   └── stop.js               Stop hook
└── node_modules/             Full dependency tree (standalone install)
```

### Ports

| Port | Protocol  | Purpose                                          |
|------|-----------|--------------------------------------------------|
| 7337 | HTTP      | Hook event receiver + web UI + sprite API        |
| 7338 | WebSocket | Real-time state broadcast to all clients         |

Override with `HEYCLAUDE_DAEMON_PORT` and `HEYCLAUDE_WS_PORT`.

---

## Troubleshooting

### Daemon not starting / already running

```bash
heyclaude status        # Check if daemon responds
heyclaude stop          # Force stop
heyclaude start         # Restart
```

Check if port 7337 is in use:

```bash
lsof -i :7337
```

### WSL: popup doesn't appear

- Confirm Microsoft Edge is installed on Windows
- Check that `/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` or the 64-bit equivalent exists
- The popup HTML is written to `C:\Users\Public\heyclaude-popup.html` — ensure that path is writable
- Try opening `C:\Users\Public\heyclaude-popup.html` directly in Edge to verify it loads

### Mascot stuck on "connecting..."

The popup couldn't reach the daemon. Verify:

```bash
curl http://localhost:7337/status
```

If this returns JSON, the daemon is running. Reload the popup by stopping and restarting:

```bash
heyclaude stop && heyclaude start
```

### Hooks not firing (mascot stays idle)

Check that hooks are registered:

```bash
cat ~/.claude/settings.json | grep -A5 heyclaude
```

If missing, re-run `./install.sh`. Also verify the daemon is running (`heyclaude status`).

### tmux pane not showing

- You must be **inside a tmux session** before running `heyclaude start`
- Check: `echo $TMUX` (should not be empty)
- If not in tmux, heyclaude falls back to the standalone adapter automatically

### Wrong animal / want a specific animal

```bash
export HEYCLAUDE_ANIMAL=fox
heyclaude stop && heyclaude start
```

Or add `"animal": "fox"` to `~/.config/heyclaude/config.json`.

### Closing the popup

- **Electron** (macOS/Linux): right-click the Dock icon → Quit, or `heyclaude stop`
- **Edge popup** (WSL): right-click the taskbar Edge icon → Close window, or `heyclaude stop`
- **tmux pane**: `heyclaude stop` or close the pane with `Ctrl+b x`

---

## Updating

```bash
cd /path/to/heyclaude
git pull
./install.sh
heyclaude stop && heyclaude start
```

---

## License

MIT
