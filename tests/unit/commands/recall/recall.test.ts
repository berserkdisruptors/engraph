import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs-extra for buildAliasMap (called internally by recallModules)
vi.mock('fs-extra', async () => {
  const actual = await vi.importActual<typeof import('fs-extra')>('fs-extra');
  return {
    ...actual,
    default: {
      ...actual,
      pathExists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn(),
    },
  };
});

import { execSync } from 'child_process';
import fs from 'fs-extra';
import { recallModules } from '../../../../src/commands/recall/index.js';

const mockExecSync = vi.mocked(execSync);
const mockReadFile = vi.mocked(fs.readFile);

// Realistic codegraph index content for the alias resolver
const CODEGRAPH_INDEX = `
modules:
  - id: commands/graph
    alias: codegraph
    path: src/commands/graph
    type: entry
  - id: auth/providers
    path: src/auth/providers
    type: feature
  - id: utils
    path: src/utils
    type: utility
`;

// Realistic git log output with contextual commit action lines
const GIT_LOG_TWO_COMMITS = `abc123def456|2026-04-08T10:00:00Z|feat(codegraph): add progressive disclosure
decision(codegraph): recursive index.yaml structure with sub-graphs
rejected(codegraph): summary-based disclosure — too noisy
learned(codegraph): 500-line budget works for medium repos
---END---
def789abc012|2026-04-07T09:00:00Z|fix(codegraph): handle empty modules
constraint(codegraph): must not fail on projects with no source files
---END---`;

const GIT_LOG_EMPTY = '';

describe('recallModules', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: return codegraph index for alias resolution
    mockReadFile.mockImplementation(async (filePath: any) => {
      if (typeof filePath === 'string' && filePath.includes('index.yaml')) {
        return CODEGRAPH_INDEX as any;
      }
      throw new Error(`Unexpected read: ${filePath}`);
    });
  });

  it('searches git log by alias and parses action lines', async () => {
    mockExecSync.mockReturnValue(GIT_LOG_TWO_COMMITS);

    const result = await recallModules('/fake/project', ['codegraph']);

    expect(result.query_modules).toEqual(['commands/graph']);
    expect(result.commits).toHaveLength(2);

    const first = result.commits[0];
    expect(first.hash).toBe('abc123def456');
    expect(first.date).toBe('2026-04-08');
    expect(first.subject).toBe('feat(codegraph): add progressive disclosure');
    expect(first.actions.decision).toEqual([
      'recursive index.yaml structure with sub-graphs',
    ]);
    expect(first.actions.rejected).toEqual([
      'summary-based disclosure — too noisy',
    ]);
    expect(first.actions.learned).toEqual([
      '500-line budget works for medium repos',
    ]);

    const second = result.commits[1];
    expect(second.actions.constraint).toEqual([
      'must not fail on projects with no source files',
    ]);
  });

  it('searches using both alias and dash-converted module ID', async () => {
    mockExecSync.mockReturnValue(GIT_LOG_EMPTY);

    await recallModules('/fake/project', ['codegraph']);

    // Should search for both "codegraph" (alias) and "commands-graph" (dash-converted)
    expect(mockExecSync).toHaveBeenCalledTimes(2);
    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes('(codegraph)'))).toBe(true);
    expect(calls.some((c) => c.includes('(commands-graph)'))).toBe(true);
  });

  it('deduplicates commits found via multiple search terms', async () => {
    // Same commit returned for both alias and module ID searches
    const sameCommit = `abc123def456|2026-04-08T10:00:00Z|feat(codegraph): something
decision(codegraph): a decision
decision(commands-graph): same decision via module ID
---END---`;

    mockExecSync.mockReturnValue(sameCommit);

    const result = await recallModules('/fake/project', ['codegraph']);

    // Should deduplicate by hash
    expect(result.commits).toHaveLength(1);
  });

  it('filters by action type', async () => {
    mockExecSync.mockReturnValue(GIT_LOG_TWO_COMMITS);

    const result = await recallModules('/fake/project', ['codegraph'], {
      filter: ['rejected'],
    });

    // Only first commit has a rejected action line
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].actions.rejected).toBeDefined();
    expect(result.commits[0].actions.decision).toBeUndefined();
  });

  it('returns empty commits when no matches found', async () => {
    mockExecSync.mockReturnValue(GIT_LOG_EMPTY);

    const result = await recallModules('/fake/project', ['codegraph']);

    expect(result.commits).toHaveLength(0);
  });

  it('passes --max-count to git log', async () => {
    mockExecSync.mockReturnValue(GIT_LOG_EMPTY);

    await recallModules('/fake/project', ['codegraph'], { limit: 10 });

    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls.every((c) => c.includes('--max-count=10'))).toBe(true);
  });

  it('uses default limit of 50 when not specified', async () => {
    mockExecSync.mockReturnValue(GIT_LOG_EMPTY);

    await recallModules('/fake/project', ['codegraph']);

    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls.every((c) => c.includes('--max-count=50'))).toBe(true);
  });

  it('handles git log failure gracefully', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const result = await recallModules('/fake/project', ['codegraph']);

    expect(result.commits).toHaveLength(0);
  });

  it('sorts commits by date descending', async () => {
    const outOfOrder = `older111111111|2026-04-06T08:00:00Z|fix: older commit
decision(codegraph): old decision
---END---
newer222222222|2026-04-08T10:00:00Z|feat: newer commit
decision(codegraph): new decision
---END---`;

    mockExecSync.mockReturnValue(outOfOrder);

    const result = await recallModules('/fake/project', ['codegraph']);

    expect(result.commits[0].hash).toBe('newer2222222');
    expect(result.commits[1].hash).toBe('older1111111');
  });
});
