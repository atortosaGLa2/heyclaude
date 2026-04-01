#!/usr/bin/env bash
# heyclaude installer
# Installs the plugin to ~/.claude/plugins/heyclaude/ and registers hooks.

set -euo pipefail

PLUGIN_NAME="heyclaude"
PLUGIN_DIR="$HOME/.claude/plugins/$PLUGIN_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  heyclaude installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Install npm deps ────────────────────────────────────────────────────────
echo ""
echo "▶ Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

# ── 2. Build TypeScript ────────────────────────────────────────────────────────
echo ""
echo "▶ Building TypeScript..."
npm run build

# ── 3. Link CLI globally ───────────────────────────────────────────────────────
echo ""
echo "▶ Linking heyclaude CLI..."
npm link 2>/dev/null || true

# ── 4. Create plugin directory ────────────────────────────────────────────────
echo ""
echo "▶ Installing Claude Code plugin to $PLUGIN_DIR..."
mkdir -p "$PLUGIN_DIR/hooks"

# Copy hooks
cp "$SCRIPT_DIR/hooks/hooks.json"   "$PLUGIN_DIR/hooks/"
cp "$SCRIPT_DIR/hooks/pre-tool.js"  "$PLUGIN_DIR/hooks/"
cp "$SCRIPT_DIR/hooks/post-tool.js" "$PLUGIN_DIR/hooks/"
cp "$SCRIPT_DIR/hooks/prompt.js"    "$PLUGIN_DIR/hooks/"

# Write the plugin manifest pointing back to the source
cat > "$PLUGIN_DIR/plugin.json" <<EOF
{
  "name": "heyclaude",
  "version": "0.1.0",
  "description": "Animated mascot for Claude Code sessions",
  "hooksDir": "$PLUGIN_DIR/hooks"
}
EOF

# ── 5. Register hooks in Claude Code settings ─────────────────────────────────
SETTINGS="$HOME/.claude/settings.json"
HOOKS_JSON="$PLUGIN_DIR/hooks/hooks.json"

echo ""
echo "▶ Registering hooks in $SETTINGS..."

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
console.log('Hooks registered ✓');
NODEEOF

# ── 6. Done ────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓  heyclaude installed!"
echo ""
echo "  Usage:"
echo "    heyclaude start   — start daemon + open mascot pane"
echo "    heyclaude stop    — stop daemon"
echo "    heyclaude animal  — see your session's mascot"
echo ""
echo "  Make sure you're in a tmux session when starting Claude Code."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
