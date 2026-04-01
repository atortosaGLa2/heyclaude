#!/usr/bin/env node
/**
 * PostToolUse hook — fires after every Claude Code tool call completes.
 * Sends 'success' or 'error' state based on whether the tool succeeded.
 */

const DAEMON_URL = 'http://localhost:7337/event';
const TIMEOUT_MS = 1500;

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let toolName = 'unknown';
  let isError  = false;

  try {
    const data = JSON.parse(input);
    toolName = data.tool_name ?? data.toolName ?? 'unknown';
    // Claude Code sets tool_response.is_error for failed tools
    isError  = data.tool_response?.is_error === true;
  } catch { /* ignore */ }

  const event = isError ? 'error' : 'PostToolUse';
  const state = isError ? 'error'   : 'success';

  try {
    await fetch(DAEMON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, tool: toolName, label: isError ? `✗ ${toolName}` : `✓ ${toolName}` }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch { /* daemon not running */ }

  process.stdout.write(JSON.stringify({}));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}));
});
