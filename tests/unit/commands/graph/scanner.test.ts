import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { scanModules, deriveModuleId } from "../../../../src/commands/graph/scanner.js";

// Helper: create a temp project directory with a git repo
async function createTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "engraph-scanner-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
  return dir;
}

// Helper: create a file with dummy content
async function touch(projectPath: string, filePath: string, content = "// placeholder\n") {
  const fullPath = path.join(projectPath, filePath);
  await fs.ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, content, "utf8");
}

// Helper: git add and commit all files
async function gitCommit(projectPath: string) {
  execSync("git add -A", { cwd: projectPath, stdio: "pipe" });
  execSync('git commit -m "init" --allow-empty', { cwd: projectPath, stdio: "pipe" });
}

describe("scanModules", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectPath);
  });

  it("detects modules from a standard src/ directory structure", async () => {
    await touch(projectPath, "src/cli.ts");
    await touch(projectPath, "src/commands/init/index.ts");
    await touch(projectPath, "src/commands/init/setup.ts");
    await touch(projectPath, "src/commands/check.ts");
    await touch(projectPath, "src/utils/config.ts");
    await touch(projectPath, "src/utils/helpers.ts");
    await touch(projectPath, "src/lib/extract.ts");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    // Verify module IDs are path-derived and sorted
    const ids = modules.map((m) => m.id);
    expect(ids).toContain("root");
    expect(ids).toContain("commands/init");
    expect(ids).toContain("commands");
    expect(ids).toContain("utils");
    expect(ids).toContain("lib");

    // Verify root module contains cli.ts
    const rootMod = modules.find((m) => m.id === "root");
    expect(rootMod).toBeDefined();
    expect(rootMod!.files.some((f) => f.path.includes("cli.ts"))).toBe(true);
    expect(rootMod!.type).toBe("entry");

    // Verify commands/init contains index.ts and setup.ts
    const initMod = modules.find((m) => m.id === "commands/init");
    expect(initMod).toBeDefined();
    expect(initMod!.files).toHaveLength(2);
    expect(initMod!.type).toBe("entry");

    // Verify utils is classified as utility
    const utilsMod = modules.find((m) => m.id === "utils");
    expect(utilsMod).toBeDefined();
    expect(utilsMod!.type).toBe("utility");

    // Verify lib is classified as utility
    const libMod = modules.find((m) => m.id === "lib");
    expect(libMod).toBeDefined();
    expect(libMod!.type).toBe("utility");
  });

  it("classifies test directories and files correctly", async () => {
    await touch(projectPath, "src/app.ts");
    await touch(projectPath, "tests/unit/app.test.ts");
    await touch(projectPath, "tests/helpers/setup.ts");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    // tests/ modules should be classified as test
    const testUnitMod = modules.find((m) => m.id === "tests/unit");
    expect(testUnitMod).toBeDefined();
    expect(testUnitMod!.type).toBe("test");

    // test helper modules under tests/ are also test type
    const testHelpersMod = modules.find((m) => m.id === "tests/helpers");
    expect(testHelpersMod).toBeDefined();
    expect(testHelpersMod!.type).toBe("test");
  });

  it("separates test files from source files within a module", async () => {
    await touch(projectPath, "src/utils/config.ts");
    await touch(projectPath, "src/utils/config.test.ts");
    await touch(projectPath, "src/utils/helpers.ts");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    const utilsMod = modules.find((m) => m.id === "utils");
    expect(utilsMod).toBeDefined();
    // config.test.ts goes into test_files
    expect(utilsMod!.test_files.some((f) => f.includes("config.test.ts"))).toBe(true);
    // config.ts and helpers.ts go into files
    expect(utilsMod!.files).toHaveLength(2);
    expect(utilsMod!.files.some((f) => f.path.includes("config.ts"))).toBe(true);
    expect(utilsMod!.files.some((f) => f.path.includes("helpers.ts"))).toBe(true);
  });

  it("respects .gitignore — ignores excluded files", async () => {
    await touch(projectPath, "src/app.ts");
    await touch(projectPath, "src/generated/output.ts");
    await fs.writeFile(
      path.join(projectPath, ".gitignore"),
      "src/generated/\n",
      "utf8"
    );
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    const ids = modules.map((m) => m.id);
    expect(ids).not.toContain("generated");
    expect(ids).not.toContain("generated/output");
  });

  it("produces deterministic output — two runs yield identical results", async () => {
    await touch(projectPath, "src/commands/init/index.ts");
    await touch(projectPath, "src/commands/init/setup.ts");
    await touch(projectPath, "src/utils/config.ts");
    await touch(projectPath, "src/lib/extract.ts");
    await gitCommit(projectPath);

    const result1 = await scanModules(projectPath);
    const result2 = await scanModules(projectPath);

    // Stringify to compare full structure
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it("handles projects without a src/ directory", async () => {
    await touch(projectPath, "main.ts");
    await touch(projectPath, "commands/init.ts");
    await touch(projectPath, "utils/helpers.ts");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    const ids = modules.map((m) => m.id);
    // Without src/, paths are used as-is
    expect(ids).toContain("commands");
    expect(ids).toContain("utils");
  });

  it("handles Python project structure", async () => {
    await touch(projectPath, "src/mypackage/__init__.py");
    await touch(projectPath, "src/mypackage/models.py");
    await touch(projectPath, "src/mypackage/utils/__init__.py");
    await touch(projectPath, "src/mypackage/utils/helpers.py");
    await touch(projectPath, "tests/test_models.py");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    const ids = modules.map((m) => m.id);
    expect(ids).toContain("mypackage");
    expect(ids).toContain("mypackage/utils");
    expect(ids).toContain("tests");

    const testMod = modules.find((m) => m.id === "tests");
    expect(testMod!.type).toBe("test");
  });

  it("handles empty directories — no modules with zero files", async () => {
    await touch(projectPath, "src/app.ts");
    // Create an empty directory (no source files)
    await fs.ensureDir(path.join(projectPath, "src/empty"));
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    const ids = modules.map((m) => m.id);
    expect(ids).not.toContain("empty");
  });

  it("initializes files with empty exports and modules with empty imports", async () => {
    await touch(projectPath, "src/app.ts");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);
    const mod = modules[0];

    expect(mod.files[0].exports).toEqual([]);
    expect(mod.imports).toEqual({ internal: [], external: [] });
    expect(mod.imported_by).toEqual([]);
  });

  it("sets module path relative to project with source root prefix", async () => {
    await touch(projectPath, "src/commands/init/index.ts");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    const initMod = modules.find((m) => m.id === "commands/init");
    expect(initMod).toBeDefined();
    expect(initMod!.path).toBe("src/commands/init");
  });

  it("excludes project-root config files when src/ exists", async () => {
    await touch(projectPath, "src/cli.ts");
    await touch(projectPath, "vitest.config.ts");
    await touch(projectPath, "commitlint.config.js");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    // Root module should only contain src/ files, not project-root configs
    const rootMod = modules.find((m) => m.id === "root");
    expect(rootMod).toBeDefined();
    expect(rootMod!.files.some((f) => f.path.includes("cli.ts"))).toBe(true);
    expect(rootMod!.files.some((f) => f.path.includes("vitest.config.ts"))).toBe(false);
    expect(rootMod!.files.some((f) => f.path.includes("commitlint.config.js"))).toBe(false);
  });

  it("sets correct path for test modules outside source root", async () => {
    await touch(projectPath, "src/app.ts");
    await touch(projectPath, "tests/unit/app.test.ts");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);

    const testMod = modules.find((m) => m.id === "tests/unit");
    expect(testMod).toBeDefined();
    // Path should be tests/unit, NOT src/tests/unit
    expect(testMod!.path).toBe("tests/unit");
  });
});

describe("deriveModuleId", () => {
  it("strips source root prefix", () => {
    expect(deriveModuleId("src/commands/init", ["src"])).toBe("commands/init");
  });

  it("returns 'root' for the source root itself", () => {
    expect(deriveModuleId("src", ["src"])).toBe("root");
  });

  it("returns 'root' for empty path", () => {
    expect(deriveModuleId("", [])).toBe("root");
    expect(deriveModuleId(".", [])).toBe("root");
  });

  it("returns path as-is when no source root matches", () => {
    expect(deriveModuleId("tests/unit", ["src"])).toBe("tests/unit");
  });

  it("normalizes backslashes", () => {
    expect(deriveModuleId("src\\commands\\init", ["src"])).toBe("commands/init");
  });
});
