#!/usr/bin/env node
/**
 * UserPromptSubmit hook — fires when the user submits a message.
 * Also used for Stop hook (passed --waiting flag).
 */

const DAEMON_URL = 'http://localhost:7337/event';
const TIMEOUT_MS = 1500;

const isWaiting = process.argv.includes('--waiting');

async function main() {
  // Drain stdin (required by Claude Code hook protocol)
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const event = isWaiting ? 'Stop' : 'UserPromptSubmit';
  const state = isWaiting ? 'waiting' : 'thinking';
  const label = isWaiting ? 'waiting for you...' : 'thinking...';

  try {
    await fetch(DAEMON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, label }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch { /* daemon not running */ }

  process.stdout.write(JSON.stringify({}));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}));
});
