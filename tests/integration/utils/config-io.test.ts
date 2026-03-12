import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createTempDir, cleanupTempDir } from '../../helpers/temp-dir.js';
import { readEngraphConfig, saveEngraphConfig } from '../../../src/utils/config.js';

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
        JSON.stringify({ framework: 'engraph', version: '1.0' })
      );

      const config = readEngraphConfig(projectDir);
      expect(config).not.toBeNull();
      expect(config!.framework).toBe('engraph');
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
      expect(config!.framework).toBe('engraph');
      expect(config!.version).toBe('2.0');
    });

    it('merges with existing config', async () => {
      const configPath = path.join(projectDir, '.engraph', 'engraph.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ framework: 'engraph', aiAssistants: ['claude'] })
      );

      saveEngraphConfig(projectDir, { version: '2.0' });

      const config = readEngraphConfig(projectDir);
      expect(config!.aiAssistants).toEqual(['claude']);
      expect(config!.version).toBe('2.0');
    });

    it('overwrites with new values on same key', async () => {
      const configPath = path.join(projectDir, '.engraph', 'engraph.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ framework: 'engraph', version: '1.0' })
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
      expect(config!.framework).toBe('engraph');
      expect(config!.version).toBe('2.0');
    });
  });
});
