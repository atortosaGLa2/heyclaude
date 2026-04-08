#!/usr/bin/env node
/**
 * Stop hook — fires when Claude Code finishes responding.
 * Sets mascot to 'waiting' state.
 */

import { resolveEventUrl } from './session-helper.js';

const TIMEOUT_MS = 1500;

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const url = resolveEventUrl();
  if (url) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'Stop', label: 'waiting for you...' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch { /* daemon not running */ }
  }

  process.stdout.write(JSON.stringify({}));
}

main().catch(() => { process.stdout.write(JSON.stringify({})); });
