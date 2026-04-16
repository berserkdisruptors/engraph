import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import { checkFilePaths } from "../../../../src/commands/validate/checks/file-paths.js";
import { createTempDir, cleanupTempDir } from "../../../helpers/temp-dir.js";
import type { ParsedContextFile } from "../../../../src/commands/validate/types.js";

describe("checkFilePaths", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = createTempDir("engraph-validate-fp-");
    await fs.ensureDir(path.join(projectDir, "src", "auth"));
    await fs.writeFile(
      path.join(projectDir, "src", "auth", "index.ts"),
      "export {}"
    );
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
  });

  function makeFile(content: Record<string, unknown>): ParsedContextFile {
    return {
      filePath: path.join(projectDir, "conventions", "test.yaml"),
      relativePath: "conventions/test.yaml",
      content,
    };
  }

  it("returns no findings when all reference_files exist", async () => {
    const file = makeFile({
      reference_files: ["src/auth/index.ts"],
    });
    expect(await checkFilePaths([file], projectDir)).toEqual([]);
  });

  it("reports missing reference_files", async () => {
    const file = makeFile({
      reference_files: ["src/nonexistent/file.ts"],
    });
    const findings = await checkFilePaths([file], projectDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_UNRESOLVABLE_FILE_PATH");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].detail.field).toBe("reference_files[0]");
  });

  it("reports missing examples[].file", async () => {
    const file = makeFile({
      examples: [{ file: "src/nonexistent.ts", snippet: "code" }],
    });
    const findings = await checkFilePaths([file], projectDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_UNRESOLVABLE_FILE_PATH");
    expect(findings[0].detail.field).toBe("examples[0].file");
  });

  it("reports missing known_risks[].module literal path", async () => {
    const file = makeFile({
      known_risks: [{ module: "src/missing.ts", risk: "test" }],
    });
    const findings = await checkFilePaths([file], projectDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_UNRESOLVABLE_FILE_PATH");
    expect(findings[0].detail.field).toBe("known_risks[0].module");
  });

  it("returns no findings for valid glob in known_risks[].module", async () => {
    const file = makeFile({
      known_risks: [{ module: "src/**/*.ts", risk: "test" }],
    });
    expect(await checkFilePaths([file], projectDir)).toEqual([]);
  });

  it("reports invalid glob syntax in known_risks[].module", async () => {
    const file = makeFile({
      known_risks: [{ module: "src/[unclosed/pattern", risk: "test" }],
    });
    const findings = await checkFilePaths([file], projectDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_INVALID_GLOB_SYNTAX");
    expect(findings[0].detail.parse_error).toBeDefined();
  });

  it("returns no findings when no file-path fields are present", async () => {
    const file = makeFile({ id: "test", type: "convention" });
    expect(await checkFilePaths([file], projectDir)).toEqual([]);
  });

  describe("fix mode", () => {
    it("removes broken reference_files and emits ENGRAPH_FILE_PATH_REMOVED", async () => {
      const file = makeFile({
        reference_files: ["src/auth/index.ts", "src/nonexistent.ts"],
      });
      const findings = await checkFilePaths([file], projectDir, true);
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe("ENGRAPH_FILE_PATH_REMOVED");
      expect(findings[0].severity).toBe("info");
      expect(file.content.reference_files).toEqual(["src/auth/index.ts"]);
      expect(file.modified).toBe(true);
    });

    it("removes entire example object for broken examples[].file", async () => {
      const file = makeFile({
        examples: [
          { file: "src/nonexistent.ts", snippet: "code" },
          { file: "src/auth/index.ts", snippet: "other" },
        ],
      });
      const findings = await checkFilePaths([file], projectDir, true);
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe("ENGRAPH_FILE_PATH_REMOVED");
      expect((file.content.examples as unknown[]).length).toBe(1);
      expect((file.content.examples as any[])[0].file).toBe("src/auth/index.ts");
    });

    it("removes broken known_risks[].module literal paths", async () => {
      const file = makeFile({
        known_risks: [{ module: "src/missing.ts", risk: "test" }],
      });
      const findings = await checkFilePaths([file], projectDir, true);
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe("ENGRAPH_FILE_PATH_REMOVED");
      expect((file.content.known_risks as unknown[]).length).toBe(0);
    });

    it("does not remove glob entries from known_risks even with fix", async () => {
      const file = makeFile({
        known_risks: [{ module: "src/[unclosed/pattern", risk: "test" }],
      });
      const findings = await checkFilePaths([file], projectDir, true);
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe("ENGRAPH_INVALID_GLOB_SYNTAX");
      expect((file.content.known_risks as unknown[]).length).toBe(1);
    });
  });
});
