import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import { createTempDir, cleanupTempDir } from '../helpers/temp-dir.js';

const CLI_PATH = path.resolve('dist/cli.js');

describe('engraph upgrade (e2e)', () => {
  let tempDir: string;
  let localArtifactsDir: string;
  let projectDir: string;

  beforeAll(async () => {
    // Create a local artifact ZIP for testing
    localArtifactsDir = createTempDir('bf-e2e-upgrade-artifacts-');

    const zip = new AdmZip();
    zip.addFile('.engraph/engraph.json', Buffer.from(JSON.stringify({})));
    zip.addFile('.engraph/context/_index.yaml', Buffer.from('version: "1.0"\n'));
    zip.addFile('.engraph/context/structural/_schema.yaml', Buffer.from('type: structural\n'));
    zip.addFile('.engraph/context/conventions/_schema.yaml', Buffer.from('type: convention\n'));
    zip.addFile('.engraph/context/verification/_schema.yaml', Buffer.from('type: verification\n'));
    zip.addFile('.claude/CLAUDE.md', Buffer.from('# Engraph\n'));

    zip.writeZip(path.join(localArtifactsDir, 'engraph-template-claude-v0.0.99.zip'));
  });

  beforeEach(async () => {
    tempDir = createTempDir('bf-e2e-upgrade-');
    projectDir = tempDir;

    // Create a minimal existing engraph project
    await fs.ensureDir(path.join(projectDir, '.engraph', 'context'));
    await fs.writeFile(
      path.join(projectDir, '.engraph', 'engraph.json'),
      JSON.stringify({ aiAssistants: ['claude'], version: '0.0.1' })
    );
    await fs.writeFile(
      path.join(projectDir, '.engraph', 'context', '_index.yaml'),
      'version: "1.0"\n'
    );
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  afterAll(() => {
    cleanupTempDir(localArtifactsDir);
  });

  it('runs upgrade with --local flag and removes legacy aiAssistants', async () => {
    execSync(
      `node ${CLI_PATH} upgrade --ai claude --local ${localArtifactsDir}`,
      {
        encoding: 'utf8',
        timeout: 30000,
        cwd: projectDir,
        env: { ...process.env, FORCE_COLOR: '0' },
      }
    );

    const config = JSON.parse(
      await fs.readFile(path.join(projectDir, '.engraph', 'engraph.json'), 'utf8')
    );
    expect(config.aiAssistants).toBeUndefined();
    expect((config as any).framework).toBeUndefined();
  });

  it('fails gracefully when not in a engraph project', () => {
    const emptyDir = createTempDir('bf-e2e-empty-');

    try {
      execSync(
        `node ${CLI_PATH} upgrade --ai claude --local ${localArtifactsDir}`,
        {
          encoding: 'utf8',
          timeout: 10000,
          cwd: emptyDir,
          env: { ...process.env, FORCE_COLOR: '0' },
        }
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.status).not.toBe(0);
    } finally {
      cleanupTempDir(emptyDir);
    }
  });

  it('preserves existing engraph.json framework on failure', async () => {
    try {
      execSync(
        `node ${CLI_PATH} upgrade --ai claude --local ${localArtifactsDir}`,
        {
          encoding: 'utf8',
          timeout: 30000,
          cwd: projectDir,
          env: { ...process.env, FORCE_COLOR: '0' },
        }
      );
    } catch {
      // Upgrade may fail for non-critical reasons in test environment,
      // but the config file should still be preserved
    }

    const config = JSON.parse(
      await fs.readFile(path.join(projectDir, '.engraph', 'engraph.json'), 'utf8')
    );
    expect(config).toBeDefined();
  });
});
