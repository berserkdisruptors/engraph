import { describe, it, expect } from 'vitest';
import { matchModuleGlob } from '../../../../src/commands/shared/glob-match.js';

describe('matchModuleGlob', () => {
  describe('exact match', () => {
    it('matches identical module ID', () => {
      expect(matchModuleGlob('auth/providers', 'auth/providers')).toBe(true);
    });

    it('rejects different module ID', () => {
      expect(matchModuleGlob('auth/providers', 'auth/signup')).toBe(false);
    });

    it('rejects partial prefix match', () => {
      expect(matchModuleGlob('auth/providers/google', 'auth/providers')).toBe(false);
    });

    it('rejects partial suffix match', () => {
      expect(matchModuleGlob('auth', 'auth/providers')).toBe(false);
    });
  });

  describe('global wildcard (*)', () => {
    it('matches any module ID', () => {
      expect(matchModuleGlob('auth/providers', '*')).toBe(true);
    });

    it('matches root module', () => {
      expect(matchModuleGlob('root', '*')).toBe(true);
    });

    it('matches deeply nested module', () => {
      expect(matchModuleGlob('a/b/c/d', '*')).toBe(true);
    });
  });

  describe('single-level wildcard (parent/*)', () => {
    it('matches direct child', () => {
      expect(matchModuleGlob('auth/providers', 'auth/*')).toBe(true);
    });

    it('matches another direct child', () => {
      expect(matchModuleGlob('auth/signup', 'auth/*')).toBe(true);
    });

    it('rejects grandchild (too deep)', () => {
      expect(matchModuleGlob('auth/providers/google', 'auth/*')).toBe(false);
    });

    it('rejects the parent itself', () => {
      expect(matchModuleGlob('auth', 'auth/*')).toBe(false);
    });

    it('rejects unrelated module with same prefix substring', () => {
      expect(matchModuleGlob('authorization/roles', 'auth/*')).toBe(false);
    });

    it('works with nested parent patterns', () => {
      expect(matchModuleGlob('commands/upgrade/migrations', 'commands/upgrade/*')).toBe(true);
    });

    it('rejects deeper nesting for nested parent', () => {
      expect(matchModuleGlob('commands/upgrade/migrations/v2', 'commands/upgrade/*')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('empty pattern does not match', () => {
      expect(matchModuleGlob('auth', '')).toBe(false);
    });

    it('wildcard in middle of pattern does not match', () => {
      expect(matchModuleGlob('auth/providers', 'auth/*/google')).toBe(false);
    });

    it('double wildcard does not match', () => {
      expect(matchModuleGlob('auth/providers/google', '**')).toBe(false);
    });
  });
});
