import { describe, it, expect } from 'vitest';
import { toolToState, hookEventToState, getFrameSpeed, STATE_TIMEOUTS } from '../states.js';

describe('toolToState', () => {
  it('maps bash to executing', () => {
    expect(toolToState('bash')).toBe('executing');
  });

  it('maps read to reading', () => {
    expect(toolToState('read')).toBe('reading');
  });

  it('maps write to coding', () => {
    expect(toolToState('write')).toBe('coding');
  });

  it('maps edit to coding', () => {
    expect(toolToState('edit')).toBe('coding');
  });

  it('maps glob to searching', () => {
    expect(toolToState('glob')).toBe('searching');
  });

  it('maps grep to searching', () => {
    expect(toolToState('grep')).toBe('searching');
  });

  it('maps webfetch to browsing', () => {
    expect(toolToState('webfetch')).toBe('browsing');
  });

  it('maps websearch to browsing', () => {
    expect(toolToState('websearch')).toBe('browsing');
  });

  it('maps mcp__foo__bar to mcp', () => {
    expect(toolToState('mcp__foo__bar')).toBe('mcp');
  });

  it('maps skill to skill', () => {
    expect(toolToState('skill')).toBe('skill');
  });

  it('maps agent to planning', () => {
    expect(toolToState('agent')).toBe('planning');
  });

  it('maps unknown tool to thinking', () => {
    expect(toolToState('unknown')).toBe('thinking');
  });
});

describe('hookEventToState', () => {
  it('maps PreToolUse with tool name to the tool state', () => {
    expect(hookEventToState('PreToolUse', 'bash')).toBe('executing');
  });

  it('maps PostToolUse to success', () => {
    expect(hookEventToState('PostToolUse')).toBe('success');
  });

  it('maps UserPromptSubmit to thinking', () => {
    expect(hookEventToState('UserPromptSubmit')).toBe('thinking');
  });

  it('maps Stop to waiting', () => {
    expect(hookEventToState('Stop')).toBe('waiting');
  });
});

describe('getFrameSpeed', () => {
  it('returns 600 for idle', () => {
    expect(getFrameSpeed('idle')).toBe(600);
  });

  it('returns 250 for coding', () => {
    expect(getFrameSpeed('coding')).toBe(250);
  });
});

describe('STATE_TIMEOUTS', () => {
  it('has a timeout for success', () => {
    expect(STATE_TIMEOUTS.success).toBeDefined();
    expect(typeof STATE_TIMEOUTS.success).toBe('number');
  });

  it('has a timeout for error', () => {
    expect(STATE_TIMEOUTS.error).toBeDefined();
    expect(typeof STATE_TIMEOUTS.error).toBe('number');
  });

  it('has a timeout for thinking', () => {
    expect(STATE_TIMEOUTS.thinking).toBeDefined();
    expect(typeof STATE_TIMEOUTS.thinking).toBe('number');
  });

  it('has a timeout for waiting', () => {
    expect(STATE_TIMEOUTS.waiting).toBeDefined();
    expect(typeof STATE_TIMEOUTS.waiting).toBe('number');
  });
});
