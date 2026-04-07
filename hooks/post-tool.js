#!/usr/bin/env node
/**
 * PostToolUse hook — fires after every Claude Code tool call completes.
 * Sends 'success' or 'error' state based on whether the tool succeeded.
 */

import { resolveEventUrl } from './session-helper.js';

const TIMEOUT_MS = 1500;

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let toolName = 'unknown';
  let isError  = false;

  try {
    const data = JSON.parse(input);
    toolName = data.tool_name ?? data.toolName ?? 'unknown';
    isError  = data.tool_response?.is_error === true;
  } catch { /* ignore */ }

  const event = isError ? 'error' : 'PostToolUse';

  const url = resolveEventUrl();
  if (url) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          tool: toolName,
          label: isError ? `✗ ${toolName}` : `✓ ${toolName}`,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch { /* daemon not running */ }
  }

  process.stdout.write(JSON.stringify({}));
}

main().catch(() => { process.stdout.write(JSON.stringify({})); });
