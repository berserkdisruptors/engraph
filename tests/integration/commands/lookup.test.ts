import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { stringify } from 'yaml';
import { createTempDir, cleanupTempDir } from '../../helpers/temp-dir.js';
import { lookupModules } from '../../../src/commands/lookup/index.js';

describe('lookupModules (integration)', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = createTempDir('engraph-lookup-');

    // Create minimal codegraph with aliases
    const codegraphDir = path.join(projectDir, '.engraph', 'codegraph');
    await fs.ensureDir(codegraphDir);
    await fs.writeFile(
      path.join(codegraphDir, 'index.yaml'),
      stringify({
        modules: [
          { id: 'auth', path: 'src/auth', type: 'feature' },
          { id: 'auth/providers', path: 'src/auth/providers', type: 'feature' },
          { id: 'auth/signup', path: 'src/auth/signup', type: 'feature' },
          { id: 'api', path: 'src/api', type: 'feature', alias: 'api' },
          { id: 'api/routes', path: 'src/api/routes', type: 'feature' },
          { id: 'utils', path: 'src/utils', type: 'utility' },
        ],
      })
    );

    // Create context directory with conventions and verifications
    const convDir = path.join(projectDir, '.engraph', 'context', 'conventions');
    const verDir = path.join(projectDir, '.engraph', 'context', 'verifications');
    await fs.ensureDir(convDir);
    await fs.ensureDir(verDir);

    // Convention: scoped to auth/*
    await fs.writeFile(
      path.join(convDir, 'auth-patterns.yaml'),
      stringify({
        id: 'auth-patterns',
        name: 'Auth Patterns',
        type: 'convention',
        applies_to_modules: ['auth/*'],
        provenance: 'manual',
        description: 'Authentication patterns for auth modules',
      })
    );

    // Convention: global
    await fs.writeFile(
      path.join(convDir, 'naming.yaml'),
      stringify({
        id: 'naming',
        name: 'Naming Conventions',
        type: 'convention',
        applies_to_modules: ['*'],
        provenance: 'manual',
        description: 'Global naming conventions',
      })
    );

    // Convention: scoped to api/routes
    await fs.writeFile(
      path.join(convDir, 'api-errors.yaml'),
      stringify({
        id: 'api-errors',
        name: 'API Error Handling',
        type: 'convention',
        applies_to_modules: ['api/routes'],
        provenance: 'manual',
        description: 'Error handling for API routes',
      })
    );

    // Verification: scoped to auth/*
    await fs.writeFile(
      path.join(verDir, 'auth-testing.yaml'),
      stringify({
        id: 'auth-testing',
        name: 'Auth Testing',
        type: 'verification',
        triggered_by_modules: ['auth/*'],
        provenance: 'manual',
        description: 'Testing procedures for auth modules',
      })
    );

    // Verification: global
    await fs.writeFile(
      path.join(verDir, 'code-review.yaml'),
      stringify({
        id: 'code-review',
        name: 'Code Review',
        type: 'verification',
        triggered_by_modules: ['*'],
        provenance: 'manual',
        description: 'General code review checklist',
      })
    );

    // Generate _index.yaml
    await fs.writeFile(
      path.join(projectDir, '.engraph', 'context', '_index.yaml'),
      stringify({
        version: '1.0',
        generated_at: new Date().toISOString(),
        codegraph_hash: 'test123',
        conventions: [
          { id: 'api-errors', path: 'conventions/api-errors.yaml', applies_to_modules: ['api/routes'], provenance: 'manual' },
          { id: 'auth-patterns', path: 'conventions/auth-patterns.yaml', applies_to_modules: ['auth/*'], provenance: 'manual' },
          { id: 'naming', path: 'conventions/naming.yaml', applies_to_modules: ['*'], provenance: 'manual' },
        ],
        verifications: [
          { id: 'auth-testing', path: 'verifications/auth-testing.yaml', triggered_by_modules: ['auth/*'], provenance: 'manual' },
          { id: 'code-review', path: 'verifications/code-review.yaml', triggered_by_modules: ['*'], provenance: 'manual' },
        ],
      })
    );
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
  });

  it('returns scoped conventions for a matching module', async () => {
    const result = await lookupModules(projectDir, ['auth/providers']);

    expect(result.query_modules).toEqual(['auth/providers']);
    expect(result.conventions).toHaveLength(1);
    expect(result.conventions[0].id).toBe('auth-patterns');
    expect(result.global_conventions).toHaveLength(1);
    expect(result.global_conventions[0].id).toBe('naming');
  });

  it('returns scoped verification for a matching module', async () => {
    const result = await lookupModules(projectDir, ['auth/signup']);

    expect(result.verifications).toHaveLength(2);
    const ids = result.verifications.map((v) => v.id).sort();
    expect(ids).toEqual(['auth-testing', 'code-review']);
  });

  it('returns only globals for a module with no scoped conventions', async () => {
    const result = await lookupModules(projectDir, ['utils']);

    expect(result.conventions).toHaveLength(0);
    expect(result.global_conventions).toHaveLength(1);
    expect(result.global_conventions[0].id).toBe('naming');
  });

  it('returns exact-match convention for api/routes', async () => {
    const result = await lookupModules(projectDir, ['api/routes']);

    expect(result.conventions).toHaveLength(1);
    expect(result.conventions[0].id).toBe('api-errors');
  });

  it('handles multiple query modules', async () => {
    const result = await lookupModules(projectDir, ['auth/providers', 'api/routes']);

    expect(result.conventions).toHaveLength(2);
    const ids = result.conventions.map((c) => c.id).sort();
    expect(ids).toEqual(['api-errors', 'auth-patterns']);
  });

  it('returns full content of matched definition files', async () => {
    const result = await lookupModules(projectDir, ['auth/providers']);

    expect(result.conventions[0].content).toBeDefined();
    expect(result.conventions[0].content.description).toBe(
      'Authentication patterns for auth modules'
    );
  });

  it('falls back to scanning when _index.yaml is missing', async () => {
    // Remove the index
    await fs.remove(path.join(projectDir, '.engraph', 'context', '_index.yaml'));

    const result = await lookupModules(projectDir, ['auth/providers']);

    // Should still find results via fallback scanning
    expect(result.conventions).toHaveLength(1);
    expect(result.conventions[0].id).toBe('auth-patterns');
    expect(result.global_conventions).toHaveLength(1);
  });

  it('returns empty results when context directory does not exist', async () => {
    const emptyDir = createTempDir('engraph-lookup-empty-');
    await fs.ensureDir(path.join(emptyDir, '.engraph', 'codegraph'));
    await fs.writeFile(
      path.join(emptyDir, '.engraph', 'codegraph', 'index.yaml'),
      stringify({ modules: [] })
    );

    try {
      const result = await lookupModules(emptyDir, ['anything']);
      expect(result.conventions).toHaveLength(0);
      expect(result.verifications).toHaveLength(0);
      expect(result.global_conventions).toHaveLength(0);
    } finally {
      cleanupTempDir(emptyDir);
    }
  });
});
