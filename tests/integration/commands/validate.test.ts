import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import { parse } from "yaml";
import { createTempDir, cleanupTempDir } from "../../helpers/temp-dir.js";
import { validateCommand } from "../../../src/commands/validate/index.js";

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "../../fixtures/validate"
);

/**
 * Copy a fixture directory to a temp location for isolated testing.
 */
async function useFixture(fixtureName: string): Promise<string> {
  const src = path.join(FIXTURES_DIR, fixtureName);
  const dest = createTempDir(`engraph-validate-${fixtureName}-`);
  await fs.copy(src, dest);
  return dest;
}

describe("validateCommand (integration)", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) cleanupTempDir(projectDir);
  });

  // ── Valid project ────────────────────────────────────────────────────
  describe("valid-project", () => {
    beforeEach(async () => {
      projectDir = await useFixture("valid-project");
    });

    it("returns status ok with no findings", async () => {
      const { result, exitCode } = await validateCommand(projectDir);
      expect(result.status).toBe("ok");
      expect(result.findings).toHaveLength(0);
      expect(result.files_checked).toBe(2);
      expect(exitCode).toBe(0);
    });

    it("output is valid JSON with correct structure", async () => {
      const { result } = await validateCommand(projectDir);
      // Roundtrip through JSON to verify serialization
      const json = JSON.parse(JSON.stringify(result));
      expect(json.status).toBeDefined();
      expect(json.codegraph_path).toBeDefined();
      expect(json.files_checked).toBeDefined();
      expect(json.findings).toBeDefined();
      expect(json.summary).toBeDefined();
      expect(json.summary.errors + json.summary.warnings + json.summary.info).toBe(
        json.findings.length
      );
    });
  });

  // ── Missing codegraph ────────────────────────────────────────────────
  describe("missing-codegraph", () => {
    beforeEach(async () => {
      projectDir = await useFixture("missing-codegraph");
    });

    it("emits ENGRAPH_MISSING_CODEGRAPH with exit code 2", async () => {
      const { result, exitCode } = await validateCommand(projectDir);
      expect(exitCode).toBe(2);
      expect(result.status).toBe("error");
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].code).toBe("ENGRAPH_MISSING_CODEGRAPH");
      expect(result.findings[0].detail.expected_path).toBeDefined();
      expect(result.files_checked).toBe(0);
    });
  });

  // ── Schema invalid ──────────────────────────────────────────────────
  describe("schema-invalid", () => {
    beforeEach(async () => {
      projectDir = await useFixture("schema-invalid");
    });

    it("emits ENGRAPH_SCHEMA_INVALID for missing required fields", async () => {
      const { result, exitCode } = await validateCommand(projectDir);
      expect(exitCode).toBe(1);
      const schemaFindings = result.findings.filter(
        (f) => f.code === "ENGRAPH_SCHEMA_INVALID"
      );
      expect(schemaFindings.length).toBeGreaterThan(0);
      // Verify detail shape per spec
      for (const f of schemaFindings) {
        expect(f.severity).toBe("error");
        expect(typeof f.detail.field).toBe("string");
        expect(typeof f.detail.reason).toBe("string");
      }
    });
  });

  // ── Duplicate ID ────────────────────────────────────────────────────
  describe("duplicate-id", () => {
    beforeEach(async () => {
      projectDir = await useFixture("duplicate-id");
    });

    it("emits ENGRAPH_DUPLICATE_ID with correct detail shape", async () => {
      const { result, exitCode } = await validateCommand(projectDir);
      expect(exitCode).toBe(1);
      const dupFindings = result.findings.filter(
        (f) => f.code === "ENGRAPH_DUPLICATE_ID"
      );
      expect(dupFindings).toHaveLength(1);
      expect(dupFindings[0].detail.id).toBe("shared-id");
      expect(dupFindings[0].detail.files).toBeInstanceOf(Array);
      expect((dupFindings[0].detail.files as string[]).length).toBe(2);
    });
  });

  // ── Broken bridge reference ─────────────────────────────────────────
  describe("broken-bridge-reference", () => {
    beforeEach(async () => {
      projectDir = await useFixture("broken-bridge-reference");
    });

    it("emits ENGRAPH_UNRESOLVABLE_REFERENCE with correct detail shape", async () => {
      const { result, exitCode } = await validateCommand(projectDir);
      expect(exitCode).toBe(1);
      const refFindings = result.findings.filter(
        (f) => f.code === "ENGRAPH_UNRESOLVABLE_REFERENCE"
      );
      expect(refFindings.length).toBeGreaterThanOrEqual(2);
      for (const f of refFindings) {
        expect(f.severity).toBe("error");
        expect(typeof f.detail.field).toBe("string");
        expect(typeof f.detail.value).toBe("string");
        expect(typeof f.detail.reason).toBe("string");
      }
    });

    it("does not report valid references as broken", async () => {
      const { result } = await validateCommand(projectDir);
      const refFindings = result.findings.filter(
        (f) => f.code === "ENGRAPH_UNRESOLVABLE_REFERENCE"
      );
      const brokenValues = refFindings.map((f) => f.detail.value);
      expect(brokenValues).not.toContain("auth");
    });
  });

  // ── Orphaned file ───────────────────────────────────────────────────
  describe("orphaned-file", () => {
    beforeEach(async () => {
      projectDir = await useFixture("orphaned-file");
    });

    it("emits ENGRAPH_ORPHANED_FILE for fully unresolvable file", async () => {
      const { result, exitCode } = await validateCommand(projectDir);
      expect(exitCode).toBe(1);
      const orphanFindings = result.findings.filter(
        (f) => f.code === "ENGRAPH_ORPHANED_FILE"
      );
      expect(orphanFindings).toHaveLength(1);
      expect(orphanFindings[0].severity).toBe("error");
      expect(typeof orphanFindings[0].detail.reason).toBe("string");
    });
  });

  // ── Broken file path ────────────────────────────────────────────────
  describe("broken-file-path", () => {
    beforeEach(async () => {
      projectDir = await useFixture("broken-file-path");
    });

    it("emits ENGRAPH_UNRESOLVABLE_FILE_PATH with correct detail shape", async () => {
      const { result } = await validateCommand(projectDir);
      const fpFindings = result.findings.filter(
        (f) => f.code === "ENGRAPH_UNRESOLVABLE_FILE_PATH"
      );
      expect(fpFindings.length).toBeGreaterThanOrEqual(1);
      for (const f of fpFindings) {
        expect(f.severity).toBe("warning");
        expect(typeof f.detail.field).toBe("string");
        expect(typeof f.detail.value).toBe("string");
        expect(typeof f.detail.reason).toBe("string");
      }
    });

    it("file path warnings do not cause non-zero exit (no errors)", async () => {
      // This fixture has valid bridge refs, so only warnings
      const { result } = await validateCommand(projectDir);
      const hasOnlyWarnings = result.findings.every(
        (f) => f.severity === "warning" || f.severity === "info"
      );
      if (hasOnlyWarnings) {
        expect(result.status).toBe("ok");
      }
    });
  });

  // ── Broken example file ─────────────────────────────────────────────
  describe("broken-example-file", () => {
    beforeEach(async () => {
      projectDir = await useFixture("broken-example-file");
    });

    it("emits ENGRAPH_UNRESOLVABLE_FILE_PATH for examples[].file", async () => {
      const { result } = await validateCommand(projectDir);
      const fpFindings = result.findings.filter(
        (f) => f.code === "ENGRAPH_UNRESOLVABLE_FILE_PATH"
      );
      expect(fpFindings).toHaveLength(1);
      expect(fpFindings[0].detail.field).toBe("examples[0].file");
    });
  });

  // ── Invalid glob ────────────────────────────────────────────────────
  describe("invalid-glob", () => {
    beforeEach(async () => {
      projectDir = await useFixture("invalid-glob");
    });

    it("emits ENGRAPH_INVALID_GLOB_SYNTAX with correct detail shape", async () => {
      const { result } = await validateCommand(projectDir);
      const globFindings = result.findings.filter(
        (f) => f.code === "ENGRAPH_INVALID_GLOB_SYNTAX"
      );
      expect(globFindings).toHaveLength(1);
      expect(globFindings[0].severity).toBe("warning");
      expect(typeof globFindings[0].detail.field).toBe("string");
      expect(typeof globFindings[0].detail.value).toBe("string");
      expect(typeof globFindings[0].detail.parse_error).toBe("string");
    });
  });

  // ── Multi-finding ───────────────────────────────────────────────────
  describe("multi-finding", () => {
    beforeEach(async () => {
      projectDir = await useFixture("multi-finding");
    });

    it("produces multiple findings sorted by file then code", async () => {
      const { result } = await validateCommand(projectDir);
      expect(result.findings.length).toBeGreaterThan(1);

      // Verify stable ordering: sorted by file then code
      for (let i = 1; i < result.findings.length; i++) {
        const prev = result.findings[i - 1];
        const curr = result.findings[i];
        const fileCompare = prev.file.localeCompare(curr.file);
        if (fileCompare === 0) {
          expect(prev.code.localeCompare(curr.code)).toBeLessThanOrEqual(0);
        } else {
          expect(fileCompare).toBeLessThan(0);
        }
      }
    });

    it("summary counts match findings array", async () => {
      const { result } = await validateCommand(projectDir);
      const total =
        result.summary.errors + result.summary.warnings + result.summary.info;
      expect(total).toBe(result.findings.length);
    });

    it("status field matches exit code semantics", async () => {
      const { result, exitCode } = await validateCommand(projectDir);
      if (result.summary.errors > 0) {
        expect(result.status).toBe("error");
        expect(exitCode).toBe(1);
      } else {
        expect(result.status).toBe("ok");
        expect(exitCode).toBe(0);
      }
    });
  });

  // ── Exit code matrix ────────────────────────────────────────────────
  describe("exit code matrix", () => {
    it("exit 0 for clean run with no findings", async () => {
      projectDir = await useFixture("valid-project");
      const { exitCode } = await validateCommand(projectDir);
      expect(exitCode).toBe(0);
    });

    it("exit 1 for error-severity findings", async () => {
      projectDir = await useFixture("schema-invalid");
      const { exitCode } = await validateCommand(projectDir);
      expect(exitCode).toBe(1);
    });

    it("exit 2 for missing codegraph", async () => {
      projectDir = await useFixture("missing-codegraph");
      const { exitCode } = await validateCommand(projectDir);
      expect(exitCode).toBe(2);
    });

    it("exit 0 for only warning-severity findings", async () => {
      projectDir = await useFixture("broken-file-path");
      const { result, exitCode } = await validateCommand(projectDir);
      // If this fixture only has warnings (no bridge errors), exit should be 0
      const hasErrors = result.findings.some((f) => f.severity === "error");
      if (!hasErrors) {
        expect(exitCode).toBe(0);
      }
    });
  });

  // ── Fix mode ──────────────────────────────────────────────────────────
  describe("fix mode", () => {
    describe("bridge field reference removal", () => {
      beforeEach(async () => {
        projectDir = await useFixture("broken-bridge-reference");
      });

      it("emits ENGRAPH_REFERENCE_REMOVED instead of ENGRAPH_UNRESOLVABLE_REFERENCE", async () => {
        const { result } = await validateCommand(projectDir, { fix: true });
        const removed = result.findings.filter(
          (f) => f.code === "ENGRAPH_REFERENCE_REMOVED"
        );
        const unresolvable = result.findings.filter(
          (f) => f.code === "ENGRAPH_UNRESOLVABLE_REFERENCE"
        );
        expect(removed.length).toBeGreaterThanOrEqual(1);
        expect(unresolvable).toHaveLength(0);
        for (const f of removed) {
          expect(f.severity).toBe("info");
          expect(typeof f.detail.field).toBe("string");
          expect(typeof f.detail.removed).toBe("string");
          expect(typeof f.detail.reason).toBe("string");
        }
      });

      it("removes broken entry from YAML file on disk", async () => {
        await validateCommand(projectDir, { fix: true });
        const convPath = path.join(
          projectDir,
          ".engraph",
          "context",
          "conventions",
          "broken-conv.yaml"
        );
        const content = parse(await fs.readFile(convPath, "utf8"));
        expect(content.applies_to_modules).toEqual(["auth"]);
        expect(content.applies_to_modules).not.toContain("payments");
      });

      it("preserves other file content after fix", async () => {
        await validateCommand(projectDir, { fix: true });
        const convPath = path.join(
          projectDir,
          ".engraph",
          "context",
          "conventions",
          "broken-conv.yaml"
        );
        const content = parse(await fs.readFile(convPath, "utf8"));
        expect(content.id).toBe("broken-conv");
        expect(content.type).toBe("convention");
        expect(content.provenance).toBe("manual");
      });

      it("file is still valid YAML after fix", async () => {
        await validateCommand(projectDir, { fix: true });
        const convPath = path.join(
          projectDir,
          ".engraph",
          "context",
          "conventions",
          "broken-conv.yaml"
        );
        const raw = await fs.readFile(convPath, "utf8");
        expect(() => parse(raw)).not.toThrow();
      });
    });

    describe("file path removal", () => {
      it("removes broken reference_files entries", async () => {
        projectDir = await useFixture("broken-file-path");
        const { result } = await validateCommand(projectDir, { fix: true });
        const removed = result.findings.filter(
          (f) => f.code === "ENGRAPH_FILE_PATH_REMOVED"
        );
        expect(removed.length).toBeGreaterThanOrEqual(1);

        const convPath = path.join(
          projectDir,
          ".engraph",
          "context",
          "conventions",
          "broken-ref-files.yaml"
        );
        const content = parse(await fs.readFile(convPath, "utf8"));
        // Only the non-existent path should be removed
        for (const ref of content.reference_files ?? []) {
          expect(await fs.pathExists(path.resolve(projectDir, ref))).toBe(true);
        }
      });

      it("removes entire example object for broken examples[].file", async () => {
        projectDir = await useFixture("broken-example-file");
        const { result } = await validateCommand(projectDir, { fix: true });
        const removed = result.findings.filter(
          (f) => f.code === "ENGRAPH_FILE_PATH_REMOVED"
        );
        expect(removed).toHaveLength(1);
        expect(removed[0].detail.field).toBe("examples[0].file");

        const convPath = path.join(
          projectDir,
          ".engraph",
          "context",
          "conventions",
          "broken-example.yaml"
        );
        const content = parse(await fs.readFile(convPath, "utf8"));
        expect(content.examples).toHaveLength(0);
      });

      it("removes broken known_risks[].module literal paths", async () => {
        projectDir = await useFixture("broken-file-path");
        await validateCommand(projectDir, { fix: true });

        const verPath = path.join(
          projectDir,
          ".engraph",
          "context",
          "verifications",
          "broken-risk-module.yaml"
        );
        const content = parse(await fs.readFile(verPath, "utf8"));
        expect(content.known_risks).toHaveLength(0);
      });
    });

    describe("read-only mode does not modify files", () => {
      it("files are byte-identical without --fix", async () => {
        projectDir = await useFixture("broken-bridge-reference");
        const convPath = path.join(
          projectDir,
          ".engraph",
          "context",
          "conventions",
          "broken-conv.yaml"
        );
        const before = await fs.readFile(convPath, "utf8");
        await validateCommand(projectDir);
        const after = await fs.readFile(convPath, "utf8");
        expect(after).toBe(before);
      });
    });

    describe("fix-creates-orphan", () => {
      beforeEach(async () => {
        projectDir = await useFixture("fix-creates-orphan");
      });

      it("removes broken reference but file is NOT orphaned", async () => {
        const { result } = await validateCommand(projectDir, { fix: true });
        const removed = result.findings.filter(
          (f) => f.code === "ENGRAPH_REFERENCE_REMOVED"
        );
        const orphaned = result.findings.filter(
          (f) => f.code === "ENGRAPH_ORPHANED_FILE"
        );
        expect(removed).toHaveLength(1);
        expect(orphaned).toHaveLength(0);
      });

      it("exit 0 after fix resolves all errors", async () => {
        const { exitCode } = await validateCommand(projectDir, { fix: true });
        expect(exitCode).toBe(0);
      });
    });

    describe("fix-empties-bridge-field", () => {
      beforeEach(async () => {
        projectDir = await useFixture("fix-empties-bridge-field");
      });

      it("empties bridge array and flags file as orphaned", async () => {
        const { result } = await validateCommand(projectDir, { fix: true });
        const removed = result.findings.filter(
          (f) => f.code === "ENGRAPH_REFERENCE_REMOVED"
        );
        const orphaned = result.findings.filter(
          (f) => f.code === "ENGRAPH_ORPHANED_FILE"
        );
        expect(removed.length).toBeGreaterThanOrEqual(1);
        expect(orphaned).toHaveLength(1);
      });

      it("exit 1 when orphaned file remains after fix", async () => {
        const { exitCode } = await validateCommand(projectDir, { fix: true });
        expect(exitCode).toBe(1);
      });
    });

    describe("fix-mode exit codes", () => {
      it("exit 0 when --fix resolves all errors", async () => {
        projectDir = await useFixture("fix-creates-orphan");
        const { exitCode } = await validateCommand(projectDir, { fix: true });
        expect(exitCode).toBe(0);
      });

      it("exit 1 when errors remain after fix", async () => {
        projectDir = await useFixture("fix-empties-bridge-field");
        const { exitCode } = await validateCommand(projectDir, { fix: true });
        expect(exitCode).toBe(1);
      });

      it("exit 0 on already-clean project with --fix", async () => {
        projectDir = await useFixture("valid-project");
        const { exitCode } = await validateCommand(projectDir, { fix: true });
        expect(exitCode).toBe(0);
      });
    });

    describe("format preservation", () => {
      it("--fix on valid project leaves all files byte-identical", async () => {
        projectDir = await useFixture("valid-project");
        const convDir = path.join(projectDir, ".engraph", "context", "conventions");
        const verDir = path.join(projectDir, ".engraph", "context", "verifications");

        // Read all files before
        const filesBefore = new Map<string, string>();
        for (const dir of [convDir, verDir]) {
          if (await fs.pathExists(dir)) {
            for (const entry of await fs.readdir(dir)) {
              if (entry.startsWith("_") || !entry.endsWith(".yaml")) continue;
              const p = path.join(dir, entry);
              filesBefore.set(p, await fs.readFile(p, "utf8"));
            }
          }
        }

        await validateCommand(projectDir, { fix: true });

        // Compare every file byte-for-byte
        for (const [filePath, before] of filesBefore) {
          const after = await fs.readFile(filePath, "utf8");
          expect(after).toBe(before);
        }
      });

      it("--fix produces surgical diff — only the broken entry is removed", async () => {
        projectDir = await useFixture("fix-preserves-formatting");
        const convPath = path.join(
          projectDir,
          ".engraph",
          "context",
          "conventions",
          "formatting-test.yaml"
        );

        const before = await fs.readFile(convPath, "utf8");
        const beforeLines = before.split("\n");

        await validateCommand(projectDir, { fix: true });

        const after = await fs.readFile(convPath, "utf8");
        const afterLines = after.split("\n");

        // Exactly one line should be removed
        expect(afterLines.length).toBe(beforeLines.length - 1);

        // The removed line is the broken "payments" entry
        const removedLine = beforeLines.find(
          (line, i) => !afterLines.includes(line) || beforeLines.indexOf(line) !== afterLines.indexOf(line)
        );

        // Reconstruct: inserting the removed line back should yield the original
        const brokenEntryLine = '  - "payments"';
        const brokenIdx = beforeLines.indexOf(brokenEntryLine);
        expect(brokenIdx).toBeGreaterThan(-1);

        // After = Before with that one line spliced out
        const expected = [...beforeLines];
        expected.splice(brokenIdx, 1);
        expect(afterLines).toEqual(expected);
      });
    });
  });
});
