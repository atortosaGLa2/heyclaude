# heyclaude

**An animated pixel-art mascot for your Claude Code terminal sessions.**

Each Claude Code session gets a deterministic animal companion that reacts in real time to what Claude is doing -- coding, reading, searching, browsing, and more -- rendered directly in your terminal or in a browser window.

![Node.js 18+](https://img.shields.io/badge/node-18%2B-brightgreen)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)
![License](https://img.shields.io/badge/license-MIT-yellow)

---

## Features

- **10 hand-crafted pixel sprites** rendered via 16x16 half-block art
- **15 animation states** that respond to Claude Code tool usage in real time
- **Particle effects** -- sparkles, rain, bubbles, lightning, code fragments, and more
- **5 color themes** -- claude, ocean, forest, neon, mono
- **Cross-platform** -- tmux pane mode, standalone terminal window, or web UI
- **Zero-config** -- installs as a Claude Code plugin with automatic hook registration
- **Session-aware** -- each session deterministically maps to an animal from Claude Code's wordlist

### Sprite Gallery

| Sprite   | Emoji | Sprite   | Emoji |
|----------|-------|----------|-------|
| crab     | `🦀`   | fox      | `🦊`   |
| octopus  | `🐙`   | penguin  | `🐧`   |
| bunny    | `🐰`   | dragon   | `🐉`   |
| cat      | `😺`   | robot    | `🤖`   |
| owl      | `🦉`   | panda    | `🐼`   |

A generic **Claude mascot** is used as the fallback when the session's animal does not have a dedicated sprite.

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-username/heyclaude.git && cd heyclaude

# 2. Install (builds TypeScript, links CLI, registers Claude Code hooks)
./install.sh

# 3. Start the mascot (inside tmux for pane mode, or standalone)
heyclaude start
```

Then open Claude Code in the same tmux session and start working. Your mascot will react to every tool call.

---

## Installation

### Requirements

- **Node.js 18+**
- **tmux** (optional, for side-pane mode on macOS/Linux)

### macOS / Linux

```bash
./install.sh
```

The installer performs the following steps:

1. Runs `npm install` to fetch dependencies
2. Compiles TypeScript (`npm run build`)
3. Symlinks the `heyclaude` CLI into `~/.local/bin` (no sudo required)
4. Copies hooks into `~/.claude/plugins/heyclaude/`
5. Registers PreToolUse, PostToolUse, UserPromptSubmit, and Stop hooks in `~/.claude/settings.json`

Make sure `~/.local/bin` is on your `PATH`. Most shells include it by default; if not, add this to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Windows

Windows support works via the standalone adapter (a new terminal window). You can install manually:

```powershell
npm install
npm run build
node bin\heyclaude.js start
```

Then register the hooks from `hooks/hooks.json` in your `%APPDATA%\.claude\settings.json` manually, or copy the approach from `install.sh`.

---

## Usage

### Core Commands

```bash
heyclaude start     # Start the daemon and open the mascot pane/window
heyclaude stop      # Stop the daemon and close the mascot pane
heyclaude status    # Print daemon state as JSON (animal, state, session)
heyclaude animal    # Show which animal was assigned to the current session
heyclaude render    # Run the render loop directly (used internally by pane)
```

### How It Works

When you run `heyclaude start`:

1. A background **daemon** starts on port 7337, listening for hook events
2. A **render process** opens in a tmux pane (or standalone terminal window)
3. The render process connects to the daemon via WebSocket (port 7338)
4. Claude Code hooks fire HTTP POSTs to the daemon on every tool call
5. The daemon broadcasts state changes, and the renderer animates the sprite

---

## Configuration

Configuration is loaded with the following priority (later overrides earlier):

1. Built-in defaults
2. Config file
3. Environment variables
4. CLI flags

### Config File

The config file lives at:

- **macOS/Linux:** `~/.config/heyclaude/config.json` (or `$XDG_CONFIG_HOME/heyclaude/config.json`)
- **Windows:** `%APPDATA%\heyclaude\config.json`

### Options

| Option        | Default   | Env Var                  | Description                              |
|---------------|-----------|--------------------------|------------------------------------------|
| `animal`      | `auto`    | `HEYCLAUDE_ANIMAL`       | Sprite to display (`auto` = session-based) |
| `theme`       | `claude`  | `HEYCLAUDE_THEME`        | Color theme name                         |
| `position`    | `right`   | `HEYCLAUDE_POSITION`     | Pane position (`left` or `right`)        |
| `width`       | `22`      | `HEYCLAUDE_WIDTH`        | Pane width in columns                    |
| `particles`   | `true`    | `HEYCLAUDE_PARTICLES`    | Enable particle effects                  |
| `daemonPort`  | `7337`    | `HEYCLAUDE_DAEMON_PORT`  | HTTP daemon port                         |
| `wsPort`      | `7338`    | `HEYCLAUDE_WS_PORT`      | WebSocket port                           |
| `webPort`     | `7339`    | `HEYCLAUDE_WEB_PORT`     | Web UI port                              |

### Examples

Set the theme via environment variable:

```bash
export HEYCLAUDE_THEME=neon
```

Or write a config file:

```json
{
  "theme": "ocean",
  "animal": "fox",
  "particles": false
}
```

---

## Themes

Five built-in color themes control the background, borders, accents, and text colors.

| Theme    | Background | Border    | Accent 1  | Accent 2  | Dim       | Text      |
|----------|------------|-----------|-----------|-----------|-----------|-----------|
| `claude` | `#1a1a2e`  | `#2a2a4e` | `#da7756` | `#7c6af7` | `#646682` | `#e0e0e0` |
| `ocean`  | `#0f172a`  | `#1e293b` | `#2dd4bf` | `#3b82f6` | `#475569` | `#e2e8f0` |
| `forest` | `#1a2e1a`  | `#2a4e2a` | `#22c55e` | `#f59e0b` | `#4a6a4a` | `#d4e4d4` |
| `neon`   | `#0a0a0a`  | `#1a1a1a` | `#ec4899` | `#06b6d4` | `#404040` | `#f0f0f0` |
| `mono`   | `#1a1a1a`  | `#333333` | `#cccccc` | `#888888` | `#555555` | `#dddddd` |

---

## Animation States

The mascot reacts to Claude Code hook events. Each tool maps to an animation state with its own frame speed and particle effects.

| State       | Trigger                                      | Frame Speed | Particles           |
|-------------|----------------------------------------------|-------------|----------------------|
| `idle`      | No activity                                  | 600 ms      | --                   |
| `thinking`  | UserPromptSubmit, unknown tools              | 500 ms      | Thought bubbles      |
| `coding`    | Write, Edit, NotebookEdit                    | 250 ms      | Code fragments       |
| `reading`   | Read tool                                    | 500 ms      | --                   |
| `searching` | Glob, Grep                                   | 400 ms      | Scan lines           |
| `browsing`  | WebFetch, WebSearch                          | 400 ms      | Waves                |
| `executing` | Bash                                         | 200 ms      | Lightning            |
| `planning`  | Agent, TodoWrite, plan mode                  | 500 ms      | --                   |
| `waiting`   | Stop hook                                    | 800 ms      | --                   |
| `success`   | PostToolUse                                  | 200 ms      | Sparkles             |
| `error`     | Tool failure                                 | 400 ms      | Rain                 |
| `mcp`       | Any MCP tool (`mcp__*`)                      | 400 ms      | Hexagons             |
| `skill`     | Skill tool                                   | 300 ms      | --                   |
| `sleeping`  | Idle for 5+ minutes                          | 1000 ms     | --                   |
| `greeting`  | SessionStart                                 | 300 ms      | --                   |

---

## Creating Custom Sprites

Sprites are defined as 16x16 grids using hex-encoded color indices. Each sprite file exports a `Sprite` object:

```typescript
import type { Sprite } from './types.js';

export const myAnimal: Sprite = {
  name: 'myAnimal',
  emoji: '🐾',
  palette: [
    '#ffffff',  // index 1
    '#000000',  // index 2
    '#ff0000',  // index 3
    // ... up to 15 colors (hex digits 1-f)
  ],
  states: {
    idle: [
      // Frame 1: array of 16 strings, each 16 chars wide
      [
        '0000000000000000',
        '0000011111100000',
        '0001122222110000',
        // ... 13 more rows
      ],
      // Frame 2 ...
    ],
    // Other states fall back to idle if not defined
  },
};
```

Each character in the grid:
- `0` = transparent (background color)
- `1` through `f` = palette color at that index (`palette[parseInt(c, 16) - 1]`)

The terminal renders two pixel rows per character row using the half-block technique (`U+2580`), so a 16x16 sprite occupies 16 columns by 8 terminal rows.

---

## Architecture

```
Claude Code Session
    |
    v
Hook Events (PreToolUse, PostToolUse, UserPromptSubmit, Stop)
    |
    |  hooks/pre-tool.js, hooks/post-tool.js, hooks/prompt.js
    v
HTTP POST --> Daemon (localhost:7337)
    |
    |  State machine: toolToState() maps tool names to animation states
    v
WebSocket broadcast (localhost:7338)
    |
    v
Render process (tmux pane, standalone terminal, or Web UI at :7339)
    |
    v
16x16 half-block sprite + particle effects + theme colors
```

### Key Source Files

```
src/
  cli.ts              CLI entry point (start, stop, status, animal, render)
  daemon.ts           HTTP + WebSocket server for state management
  render-loop.ts      Terminal renderer (connects to daemon via WS)
  config.ts           Config loading (file + env + CLI)
  themes.ts           5 color themes with hex-to-ANSI conversion
  states.ts           Tool-to-state mapping and frame speeds
  session.ts          Session detection and animal assignment
  particles.ts        Particle effect system (per-state configs)
  types.ts            Core type definitions
  renderer.ts         Sprite rendering engine (half-block technique)
  sprites/
    types.ts          Sprite interface definition
    index.ts          Sprite registry and session-to-animal hash
    crab.ts           Crab sprite
    octopus.ts        Octopus sprite
    ...               (10 animals + fallback)
  adapters/
    terminal-adapter.ts   Adapter interface
    tmux-adapter.ts       tmux pane management
    standalone-adapter.ts Standalone terminal window
    index.ts              Adapter selection logic
  web/
    server.ts         Web UI server (localhost:7339)
hooks/
  hooks.json          Claude Code hook registration manifest
  pre-tool.js         PreToolUse hook (fires on tool start)
  post-tool.js        PostToolUse hook (fires on tool completion)
  prompt.js           UserPromptSubmit + Stop hooks
```

---

## Troubleshooting

### Daemon not starting

```bash
heyclaude status
```

If the daemon is not responding, check that port 7337 is free:

```bash
lsof -i :7337
```

Kill any stale process and restart:

```bash
heyclaude stop
heyclaude start
```

### Tmux pane not showing

- Make sure you are inside a **tmux session** before running `heyclaude start`
- Verify tmux is installed: `tmux -V`
- If you are not in tmux, heyclaude falls back to the standalone adapter (opens a new terminal window)

### Sprite not animating

- Confirm hooks are registered: check `~/.claude/settings.json` for heyclaude entries under `hooks`
- Verify the daemon is receiving events: `heyclaude status` should show the current state
- Check that Claude Code is running in the same environment where heyclaude was installed

### Wrong animal showing

The animal is determined by your Claude Code session ID. If you set a specific animal:

```bash
export HEYCLAUDE_ANIMAL=fox
```

Or add `"animal": "fox"` to your config file.

### Windows issues

- tmux is not available on Windows; heyclaude uses the standalone adapter
- Make sure `node` is on your `PATH`
- Hook paths in `settings.json` must use the correct Windows paths to the plugin directory

---

## License

MIT
