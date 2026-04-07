#!/usr/bin/env node
/**
 * UserPromptSubmit hook — fires when the user submits a message.
 * Also used for Stop hook (passed --waiting flag).
 */

import { resolveEventUrl } from './session-helper.js';

const TIMEOUT_MS = 1500;
const isWaiting  = process.argv.includes('--waiting');

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const event = isWaiting ? 'Stop' : 'UserPromptSubmit';
  const label = isWaiting ? 'waiting for you...' : 'thinking...';

  const url = resolveEventUrl();
  if (url) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, label }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch { /* daemon not running */ }
  }

  process.stdout.write(JSON.stringify({}));
}

main().catch(() => { process.stdout.write(JSON.stringify({})); });
