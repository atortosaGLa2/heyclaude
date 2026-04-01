#!/usr/bin/env node
/**
 * PreToolUse hook — fires before every Claude Code tool call.
 * Reads the tool name from stdin JSON and POSTs the state to heyclaude daemon.
 * Must always exit 0 and print valid JSON to stdout (to not block Claude Code).
 */

import { createRequire } from 'module';

const DAEMON_URL = 'http://localhost:7337/event';
const TIMEOUT_MS = 1500;

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let toolName = 'unknown';
  try {
    const data = JSON.parse(input);
    toolName = data.tool_name ?? data.toolName ?? 'unknown';
  } catch { /* ignore */ }

  // Fire-and-forget — don't block Claude Code
  try {
    await fetch(DAEMON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'PreToolUse', tool: toolName, label: toolName }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch { /* daemon not running — silently ignore */ }

  // Claude Code requires valid JSON on stdout (empty = don't block)
  process.stdout.write(JSON.stringify({}));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}));
});
