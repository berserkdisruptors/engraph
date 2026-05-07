import { describe, it, expect } from 'vitest';
import { getDefaultConfig, createConfigContent, detectInstalledAgents } from '../../../src/utils/config.js';

describe('getDefaultConfig', () => {
  it('includes prepopulated engraph context aliases', () => {
    const config = getDefaultConfig();
    expect(config.aliases).toEqual({
      'engraph/context/conventions': 'conventions',
      'engraph/context/verifications': 'verifications',
    });
  });

  it('returns a new object each call', () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('createConfigContent', () => {
  it('includes engraph context aliases when no version arg', () => {
    const content = createConfigContent();
    const parsed = JSON.parse(content);
    expect(parsed.aliases).toBeDefined();
    expect(parsed.aliases['engraph/context/conventions']).toBe('conventions');
    expect(parsed.aliases['engraph/context/verifications']).toBe('verifications');
  });

  it('includes version when provided', () => {
    const content = createConfigContent('1.0.0');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe('1.0.0');
  });

  it('produces formatted JSON with trailing newline', () => {
    const content = createConfigContent('1.0.0');
    expect(content).toMatch(/\n$/);
    expect(content).toContain('  "version"');
  });

  it('does not include framework or aiAssistants keys', () => {
    const content = createConfigContent('1.0.0');
    expect(content).not.toContain('framework');
    expect(content).not.toContain('aiAssistants');
  });

  it('does not include version key when not provided', () => {
    const content = createConfigContent();
    expect(content).not.toContain('version');
  });
});

describe('detectInstalledAgents', () => {
  it('returns empty array when no agent skills folders exist', () => {
    const result = detectInstalledAgents('/nonexistent/path/that/has/no/skills');
    expect(result).toEqual([]);
  });

  it('returns an array', () => {
    const result = detectInstalledAgents('/some/path');
    expect(Array.isArray(result)).toBe(true);
  });
});
