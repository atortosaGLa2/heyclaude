#!/usr/bin/env node
/**
 * PreToolUse hook — fires before every Claude Code tool call.
 * Reads the tool name from stdin JSON and POSTs the state to the
 * correct heyclaude daemon for this Claude Code session.
 * Must always exit 0 and print valid JSON to stdout.
 */

import { resolveEventUrl } from './session-helper.js';

const TIMEOUT_MS = 1500;

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let toolName = 'unknown';
  try {
    const data = JSON.parse(input);
    toolName = data.tool_name ?? data.toolName ?? 'unknown';
  } catch { /* ignore */ }

  const url = resolveEventUrl();
  if (url) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'PreToolUse', tool: toolName, label: toolName }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch { /* daemon not running — silently ignore */ }
  }

  process.stdout.write(JSON.stringify({}));
}

main().catch(() => { process.stdout.write(JSON.stringify({})); });
