import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createTempDir, cleanupTempDir } from '../../helpers/temp-dir.js';
import { validateUpgradePrerequisites } from '../../../src/commands/upgrade/validation.js';

describe('validateUpgradePrerequisites (integration)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir('bf-upgrade-val-');
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
  });

  it('fails when .engraph directory does not exist', () => {
    const result = validateUpgradePrerequisites(projectDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('.engraph/ directory not found');
    expect(result.suggestion).toContain('engraph init');
  });

  it('fails when engraph.json does not exist', async () => {
    await fs.ensureDir(path.join(projectDir, '.engraph'));

    const result = validateUpgradePrerequisites(projectDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('engraph.json not found');
  });

  it('fails when engraph.json is invalid JSON', async () => {
    await fs.ensureDir(path.join(projectDir, '.engraph'));
    await fs.writeFile(
      path.join(projectDir, '.engraph', 'engraph.json'),
      '{invalid json'
    );

    const result = validateUpgradePrerequisites(projectDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not valid JSON');
  });

  it('succeeds with valid project structure', async () => {
    await fs.ensureDir(path.join(projectDir, '.engraph'));
    await fs.writeFile(
      path.join(projectDir, '.engraph', 'engraph.json'),
      JSON.stringify({ framework: 'engraph', version: '2.0' })
    );

    const result = validateUpgradePrerequisites(projectDir);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('succeeds with minimal valid JSON', async () => {
    await fs.ensureDir(path.join(projectDir, '.engraph'));
    await fs.writeFile(
      path.join(projectDir, '.engraph', 'engraph.json'),
      '{}'
    );

    const result = validateUpgradePrerequisites(projectDir);
    expect(result.valid).toBe(true);
  });
});
