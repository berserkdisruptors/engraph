import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveModuleInputs, type AliasMap } from '../../../../src/commands/shared/alias-resolver.js';

// buildAliasMap reads the filesystem — tested in integration.
// Here we test resolveModuleInputs which is pure logic.

describe('resolveModuleInputs', () => {
  let aliasMap: AliasMap;

  beforeEach(() => {
    aliasMap = {
      aliasToModuleId: new Map([
        ['codegraph', 'commands/graph'],
        ['migrations', 'commands/upgrade/migrations'],
        ['conventions', 'context/conventions'],
      ]),
      moduleIdToAlias: new Map([
        ['commands/graph', 'codegraph'],
        ['commands/upgrade/migrations', 'migrations'],
        ['context/conventions', 'conventions'],
      ]),
      allModuleIds: new Set([
        'commands',
        'commands/graph',
        'commands/upgrade',
        'commands/upgrade/migrations',
        'context/conventions',
        'utils',
        'root',
      ]),
    };
  });

  it('resolves alias to module ID', () => {
    const result = resolveModuleInputs(['codegraph'], aliasMap);
    expect(result).toEqual(['commands/graph']);
  });

  it('resolves multiple aliases', () => {
    const result = resolveModuleInputs(['codegraph', 'migrations'], aliasMap);
    expect(result).toEqual(['commands/graph', 'commands/upgrade/migrations']);
  });

  it('passes through module IDs that are not aliases', () => {
    const result = resolveModuleInputs(['utils'], aliasMap);
    expect(result).toEqual(['utils']);
  });

  it('passes through glob patterns unchanged', () => {
    const result = resolveModuleInputs(['*'], aliasMap);
    expect(result).toEqual(['*']);
  });

  it('passes through single-level glob patterns unchanged', () => {
    const result = resolveModuleInputs(['commands/*'], aliasMap);
    expect(result).toEqual(['commands/*']);
  });

  it('handles mixed aliases, module IDs, and globs', () => {
    const result = resolveModuleInputs(['codegraph', 'utils', 'templates/*'], aliasMap);
    expect(result).toEqual(['commands/graph', 'utils', 'templates/*']);
  });

  it('passes through unknown inputs unchanged', () => {
    const result = resolveModuleInputs(['nonexistent'], aliasMap);
    expect(result).toEqual(['nonexistent']);
  });

  it('handles empty input', () => {
    const result = resolveModuleInputs([], aliasMap);
    expect(result).toEqual([]);
  });
});
