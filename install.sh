#!/usr/bin/env bash
# heyclaude installer
# Installs the plugin to ~/.claude/plugins/heyclaude/ and registers hooks.
# Supports macOS, Linux, and WSL.

set -euo pipefail

# ── Color helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${BOLD}▶ $1${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
error()   { echo -e "${RED}✗ $1${NC}"; }

# ── Parse flags ──────────────────────────────────────────────────────────────
WEB_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --web-only) WEB_ONLY=true ;;
  esac
done

# ── OS detection ─────────────────────────────────────────────────────────────
OS_TYPE="unknown"
IS_WSL=false

detect_os() {
  local uname_s
  uname_s="$(uname -s)"

  case "$uname_s" in
    Darwin)
      OS_TYPE="macos"
      ;;
    Linux)
      OS_TYPE="linux"
      # Check for WSL
      if [ -f /proc/version ] && grep -qi "microsoft" /proc/version; then
        IS_WSL=true
        OS_TYPE="wsl"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      OS_TYPE="windows"
      ;;
    *)
      OS_TYPE="unknown"
      ;;
  esac
}

detect_os

PLUGIN_NAME="heyclaude"
PLUGIN_DIR="$HOME/.claude/plugins/$PLUGIN_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  heyclaude installer${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
info "Detected OS: $OS_TYPE"

# ── WSL: detect Windows-side Claude Code ─────────────────────────────────────
WIN_HOME=""
USE_WIN_PATHS=false

if [ "$IS_WSL" = true ]; then
  # Try to find the Windows user home via cmd.exe
  if command -v cmd.exe &>/dev/null; then
    WIN_HOME="$(cmd.exe /C "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')" || true
    if [ -n "$WIN_HOME" ]; then
      # Convert Windows path to WSL path
      WIN_HOME_WSL="$(wslpath -u "$WIN_HOME" 2>/dev/null)" || true
      if [ -d "$WIN_HOME_WSL/.claude" ]; then
        info "Found Claude Code on Windows side at $WIN_HOME_WSL/.claude"
        echo -n "  Use Windows-side paths for hooks? [y/N] "
        read -r answer
        if [[ "$answer" =~ ^[Yy] ]]; then
          USE_WIN_PATHS=true
          PLUGIN_DIR="$WIN_HOME_WSL/.claude/plugins/$PLUGIN_NAME"
        fi
      fi
    fi
  fi
fi

# ── Check tmux availability (Linux/WSL) ──────────────────────────────────────
if [ "$WEB_ONLY" = false ] && [ "$OS_TYPE" != "macos" ]; then
  if ! command -v tmux &>/dev/null; then
    warn "tmux is not installed."
    echo "  heyclaude uses tmux to display the animated mascot in a side pane."
    echo ""
    if [ "$OS_TYPE" = "wsl" ] || [ "$OS_TYPE" = "linux" ]; then
      echo "  Install tmux with:"
      echo "    sudo apt install tmux      # Debian/Ubuntu"
      echo "    sudo dnf install tmux      # Fedora/RHEL"
      echo "    sudo pacman -S tmux        # Arch"
      echo ""
    fi
    echo "  Or re-run with --web-only to skip the tmux requirement."
    echo ""
    echo -n "  Continue anyway? [y/N] "
    read -r answer
    if [[ ! "$answer" =~ ^[Yy] ]]; then
      error "Installation aborted."
      exit 1
    fi
  fi
fi

if [ "$WEB_ONLY" = true ]; then
  success "Web-only mode: skipping tmux requirement"
fi

# ── 1. Check Node.js ────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Please install Node.js (v18+) first."
  exit 1
fi
success "Node.js $(node --version) found"

# ── 2. Install npm deps ─────────────────────────────────────────────────────
echo ""
info "Installing dependencies..."
cd "$SCRIPT_DIR"
npm install
success "Dependencies installed"

# ── 3. Build TypeScript ──────────────────────────────────────────────────────
echo ""
info "Building TypeScript..."
npm run build
success "Build complete"

# ── 4. Link CLI to ~/.local/bin (no sudo needed) ────────────────────────────
echo ""
info "Linking heyclaude CLI to ~/.local/bin..."
mkdir -p "$HOME/.local/bin"
ln -sf "$SCRIPT_DIR/bin/heyclaude.js" "$HOME/.local/bin/heyclaude"
chmod +x "$HOME/.local/bin/heyclaude"
# Ensure ~/.local/bin is in PATH for this session
export PATH="$HOME/.local/bin:$PATH"
success "CLI linked to ~/.local/bin/heyclaude"

# Check if ~/.local/bin is in PATH permanently
if ! echo "$PATH" | tr ':' '\n' | grep -q "$HOME/.local/bin"; then
  warn "~/.local/bin may not be in your PATH."
  echo "  Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# ── 5. Create plugin directory ──────────────────────────────────────────────
echo ""
info "Installing Claude Code plugin to $PLUGIN_DIR..."
mkdir -p "$PLUGIN_DIR/hooks"

# Copy hooks
cp "$SCRIPT_DIR/hooks/hooks.json"   "$PLUGIN_DIR/hooks/"
cp "$SCRIPT_DIR/hooks/pre-tool.js"  "$PLUGIN_DIR/hooks/"
cp "$SCRIPT_DIR/hooks/post-tool.js" "$PLUGIN_DIR/hooks/"
cp "$SCRIPT_DIR/hooks/prompt.js"    "$PLUGIN_DIR/hooks/"
success "Hook files copied"

# Write the plugin manifest pointing back to the source
cat > "$PLUGIN_DIR/plugin.json" <<EOF
{
  "name": "heyclaude",
  "version": "0.1.0",
  "description": "Animated mascot for Claude Code sessions",
  "hooksDir": "$PLUGIN_DIR/hooks"
}
EOF
success "Plugin manifest created"

# ── 6. Register hooks in Claude Code settings ───────────────────────────────
if [ "$USE_WIN_PATHS" = true ]; then
  SETTINGS="$WIN_HOME_WSL/.claude/settings.json"
else
  SETTINGS="$HOME/.claude/settings.json"
fi
HOOKS_JSON="$PLUGIN_DIR/hooks/hooks.json"

echo ""
info "Registering hooks in $SETTINGS..."

# Use Node to merge hooks safely (avoids complex jq gymnastics)
node --input-type=module <<NODEEOF
import { readFileSync, writeFileSync, existsSync } from 'fs';

const settingsPath = '$SETTINGS';
const pluginRoot   = '$PLUGIN_DIR';

const settings = existsSync(settingsPath)
  ? JSON.parse(readFileSync(settingsPath, 'utf8'))
  : {};

settings.hooks ??= {};

const events = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
const hookMap = {
  PreToolUse:       'pre-tool.js',
  PostToolUse:      'post-tool.js',
  UserPromptSubmit: 'prompt.js',
  Stop:             'prompt.js --waiting',
};

for (const event of events) {
  settings.hooks[event] ??= [];

  const hookCmd = \`node "\${pluginRoot}/hooks/\${hookMap[event]}"\`;

  // Don't duplicate
  const already = settings.hooks[event].some(h =>
    Array.isArray(h.hooks) && h.hooks.some(hh => hh.command?.includes('heyclaude'))
  );
  if (!already) {
    settings.hooks[event].push({
      hooks: [{ type: 'command', command: hookCmd, timeout: 2 }]
    });
  }
}

writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log('Hooks registered');
NODEEOF
success "Hooks registered in settings.json"

# ── 7. Done ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓  heyclaude installed!${NC}"
echo ""
echo "  Usage:"
echo "    heyclaude start   — start daemon + open mascot pane"
echo "    heyclaude stop    — stop daemon"
echo "    heyclaude animal  — see your session's mascot"
echo ""
if [ "$WEB_ONLY" = true ]; then
  echo -e "  ${YELLOW}Installed in web-only mode (no tmux pane).${NC}"
else
  echo "  Make sure you're in a tmux session when starting Claude Code."
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
