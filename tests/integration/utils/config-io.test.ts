import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createTempDir, cleanupTempDir } from '../../helpers/temp-dir.js';
import { readEngraphConfig, saveEngraphConfig, detectInstalledAgents } from '../../../src/utils/config.js';

describe('config I/O (integration)', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = createTempDir('bf-config-');
    await fs.ensureDir(path.join(projectDir, '.engraph'));
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
  });

  describe('readEngraphConfig', () => {
    it('returns null when file does not exist', () => {
      const config = readEngraphConfig(projectDir);
      expect(config).toBeNull();
    });

    it('reads valid config file', async () => {
      const configPath = path.join(projectDir, '.engraph', 'engraph.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ version: '1.0' })
      );

      const config = readEngraphConfig(projectDir);
      expect(config).not.toBeNull();
      expect(config!.version).toBe('1.0');
    });

    it('returns null for malformed JSON', async () => {
      const configPath = path.join(projectDir, '.engraph', 'engraph.json');
      await fs.writeFile(configPath, '{invalid json');

      const config = readEngraphConfig(projectDir);
      expect(config).toBeNull();
    });
  });

  describe('saveEngraphConfig', () => {
    it('creates new config file with defaults', () => {
      saveEngraphConfig(projectDir, { version: '2.0' });

      const config = readEngraphConfig(projectDir);
      expect(config).not.toBeNull();
      expect(config!.version).toBe('2.0');
    });

    it('removes legacy aiAssistants field when merging', async () => {
      const configPath = path.join(projectDir, '.engraph', 'engraph.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ aiAssistants: ['claude'], version: '1.0' })
      );

      saveEngraphConfig(projectDir, { version: '2.0' });

      const config = readEngraphConfig(projectDir);
      expect((config as any).aiAssistants).toBeUndefined();
      expect(config!.version).toBe('2.0');
    });

    it('removes legacy framework field when merging', async () => {
      const configPath = path.join(projectDir, '.engraph', 'engraph.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ framework: 'engraph', version: '1.0' })
      );

      saveEngraphConfig(projectDir, { version: '2.0' });

      const config = readEngraphConfig(projectDir);
      expect((config as any).framework).toBeUndefined();
      expect(config!.version).toBe('2.0');
    });

    it('overwrites with new values on same key', async () => {
      const configPath = path.join(projectDir, '.engraph', 'engraph.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ version: '1.0' })
      );

      saveEngraphConfig(projectDir, { version: '2.0' });

      const config = readEngraphConfig(projectDir);
      expect(config!.version).toBe('2.0');
    });

    it('handles malformed existing config gracefully', async () => {
      const configPath = path.join(projectDir, '.engraph', 'engraph.json');
      await fs.writeFile(configPath, '{bad json');

      saveEngraphConfig(projectDir, { version: '2.0' });

      const config = readEngraphConfig(projectDir);
      expect(config!.version).toBe('2.0');
    });
  });

  describe('detectInstalledAgents', () => {
    it('returns empty array when no agent skills folders exist', () => {
      const result = detectInstalledAgents(projectDir);
      expect(result).toEqual([]);
    });

    it('returns empty array when skills folder exists but has no engraph skills', async () => {
      await fs.ensureDir(path.join(projectDir, '.claude', 'skills', 'some-other-skill'));
      const result = detectInstalledAgents(projectDir);
      expect(result).toEqual([]);
    });

    it('detects claude when an engraph skill exists in .claude/skills', async () => {
      await fs.ensureDir(path.join(projectDir, '.claude', 'skills', 'context-search'));
      const result = detectInstalledAgents(projectDir);
      expect(result).toContain('claude');
    });

    it('detects multiple agents when engraph skills exist in multiple agent folders', async () => {
      await fs.ensureDir(path.join(projectDir, '.claude', 'skills', 'context-commit'));
      await fs.ensureDir(path.join(projectDir, '.cursor', 'skills', 'context-verify'));
      const result = detectInstalledAgents(projectDir);
      expect(result).toContain('claude');
      expect(result).toContain('cursor');
      expect(result).not.toContain('opencode');
    });
  });
});
