import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkCommand } from '../../../src/commands/check.js';

// Mock dependencies
vi.mock('../../../src/lib/interactive.js', () => ({
  showBanner: vi.fn(),
}));

vi.mock('../../../src/utils/index.js', () => ({
  checkTool: vi.fn(),
}));

vi.mock('../../../src/utils/config.js', () => ({
  detectInstalledAgents: vi.fn(),
}));

vi.mock('../../../src/lib/step-tracker.js', () => {
  return {
    StepTracker: class MockStepTracker {
      add = vi.fn();
      complete = vi.fn();
      error = vi.fn();
      render = vi.fn().mockReturnValue('rendered output');
    },
  };
});

import { checkTool } from '../../../src/utils/index.js';
import { detectInstalledAgents } from '../../../src/utils/config.js';

describe('checkCommand', () => {
  beforeEach(() => {
    vi.mocked(checkTool).mockReturnValue(false);
    vi.mocked(detectInstalledAgents).mockReturnValue(['claude', 'pi']);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('calls checkTool for git and detected folder agents', () => {
    checkCommand();
    expect(checkTool).toHaveBeenCalledWith('git');
    expect(checkTool).toHaveBeenCalledWith('claude');
    expect(checkTool).toHaveBeenCalledWith('pi');
  });

  it('only checks folder agents with known binaries', () => {
    vi.mocked(detectInstalledAgents).mockReturnValue(['universal', 'claude']);
    checkCommand();
    expect(checkTool).toHaveBeenCalledWith('claude');
    expect(checkTool).not.toHaveBeenCalledWith('universal');
  });

  it('renders and logs the tracker output', () => {
    checkCommand();
    expect(console.log).toHaveBeenCalledWith('rendered output');
  });

  it('logs ready message', () => {
    checkCommand();
    const calls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('ready to use'))).toBe(true);
  });

  it('shows tip when git is not found', () => {
    vi.mocked(checkTool).mockReturnValue(false);
    checkCommand();
    const calls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('git'))).toBe(true);
  });

  it('shows tip when no agents found', () => {
    vi.mocked(checkTool).mockReturnValue(false);
    checkCommand();
    const calls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('agent'))).toBe(true);
  });
});
