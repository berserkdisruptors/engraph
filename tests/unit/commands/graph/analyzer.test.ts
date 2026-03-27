import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { analyzeImports, resetParserState } from "../../../../src/commands/graph/analyzer.js";
import { scanModules, detectSourceRoots } from "../../../../src/commands/graph/scanner.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

async function createTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "engraph-analyzer-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
  return dir;
}

async function touch(projectPath: string, filePath: string, content: string) {
  const fullPath = path.join(projectPath, filePath);
  await fs.ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, content, "utf8");
}

async function gitCommit(projectPath: string) {
  execSync("git add -A", { cwd: projectPath, stdio: "pipe" });
  execSync('git commit -m "init" --allow-empty', { cwd: projectPath, stdio: "pipe" });
}

// Helper: scan + analyze in one call
async function analyzeProject(projectPath: string) {
  const modules = await scanModules(projectPath);
  const sourceRoots = await detectSourceRoots(projectPath);
  await analyzeImports(projectPath, modules, sourceRoots);
  return { modules, sourceRoots };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("analyzeImports", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectPath);
  });

  // ── Export extraction ──────────────────────────────────────────────────

  describe("TypeScript export extraction", () => {
    it("extracts named function exports", async () => {
      // Two files in same dir → same module "utils"
      await touch(projectPath, "src/utils/helper.ts", `
export function doSomething(): void {}
export function doOther(x: number): string { return ""; }
`);
      await touch(projectPath, "src/utils/index.ts", `// placeholder`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const mod = modules.find((m) => m.id === "utils");
      expect(mod).toBeDefined();
      const helperFile = mod!.files.find((f) => f.path.endsWith("helper.ts"));
      expect(helperFile).toBeDefined();
      expect(helperFile!.exports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "doOther", type: "function" }),
          expect.objectContaining({ name: "doSomething", type: "function" }),
        ])
      );
    });

    it("extracts class, interface, type, enum, constant exports", async () => {
      await touch(projectPath, "src/types.ts", `
export class MyClass {}
export interface MyInterface {}
export type MyType = string;
export enum MyEnum { A, B }
export const MY_CONST = 42;
`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const mod = modules.find((m) => m.id === "root");
      expect(mod).toBeDefined();
      const exports = mod!.files.flatMap((f) => f.exports);
      expect(exports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "MyClass", type: "class" }),
          expect.objectContaining({ name: "MyInterface", type: "interface" }),
          expect.objectContaining({ name: "MyType", type: "type" }),
          expect.objectContaining({ name: "MyEnum", type: "enum" }),
          expect.objectContaining({ name: "MY_CONST", type: "constant" }),
        ])
      );
    });

    it("skips re-exports from export list", async () => {
      await touch(projectPath, "src/index.ts", `
export { foo } from "./utils.js";
export function localFunc() {}
`);
      await touch(projectPath, "src/utils.ts", `export function foo() {}`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const mod = modules.find((m) => m.id === "root");
      const indexFile = mod!.files.find((f) => f.path.endsWith("index.ts"));
      const exportNames = indexFile!.exports.map((e) => e.name);
      expect(exportNames).toContain("localFunc");
      // Re-export { foo } from "./utils.js" is NOT in exports, it's an import
      expect(exportNames).not.toContain("foo");
    });
  });

  // ── Import resolution ─────────────────────────────────────────────────

  describe("import resolution", () => {
    it("resolves .js extension to .ts files (ESM pattern)", async () => {
      await touch(projectPath, "src/commands/init.ts", `
import { setup } from "./setup.js";
`);
      await touch(projectPath, "src/commands/setup.ts", `
export function setup() {}
`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      // Both files in same module → self-imports excluded
      const mod = modules.find((m) => m.id === "commands");
      expect(mod).toBeDefined();
      expect(mod!.imports.internal).toHaveLength(0);
    });

    it("resolves cross-module imports and builds dependency edges", async () => {
      // Put files in separate directories to ensure different modules
      await touch(projectPath, "src/commands/init/index.ts", `
import { getConfig } from "../../utils/config/index.js";
import fs from "fs-extra";
`);
      await touch(projectPath, "src/utils/config/index.ts", `
export function getConfig(): any { return {}; }
`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const commandsMod = modules.find((m) => m.id === "commands/init");
      expect(commandsMod).toBeDefined();
      expect(commandsMod!.imports.internal).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            module_id: "utils/config",
            symbols: expect.arrayContaining([
              expect.objectContaining({ name: "getConfig", kind: "function" }),
            ]),
          }),
        ])
      );

      // External import
      expect(commandsMod!.imports.external).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ package: "fs-extra" }),
        ])
      );
    });

    it("builds reverse index (imported_by)", async () => {
      await touch(projectPath, "src/commands/index.ts", `
import { helper } from "../utils/index.js";
`);
      await touch(projectPath, "src/utils/index.ts", `
export function helper() {}
`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const utilsMod = modules.find((m) => m.id === "utils");
      expect(utilsMod).toBeDefined();
      expect(utilsMod!.imported_by).toHaveLength(1);
      expect(utilsMod!.imported_by[0].module_id).toBe("commands");
    });
  });

  // ── External package extraction ───────────────────────────────────────

  describe("external package extraction", () => {
    it("extracts scoped package names", async () => {
      await touch(projectPath, "src/app.ts", `
import { select } from "@inquirer/prompts";
import chalk from "chalk";
`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const mod = modules.find((m) => m.id === "root");
      const packages = mod!.imports.external.map((e) => e.package);
      expect(packages).toContain("@inquirer/prompts");
      expect(packages).toContain("chalk");
    });
  });

  // ── Determinism ───────────────────────────────────────────────────────

  describe("determinism", () => {
    it("produces identical output across two runs", async () => {
      await touch(projectPath, "src/utils/config/index.ts", `
export function getConfig() {}
export const VERSION = "1.0";
`);
      await touch(projectPath, "src/utils/helper/index.ts", `
export function helper() {}
`);
      await touch(projectPath, "src/commands/init/index.ts", `
import { getConfig, VERSION } from "../../utils/config/index.js";
import { helper } from "../../utils/helper/index.js";
import fs from "fs-extra";
`);
      await touch(projectPath, "src/commands/upgrade/index.ts", `
import { getConfig } from "../../utils/config/index.js";
`);
      await gitCommit(projectPath);

      // Run 1
      const r1 = await analyzeProject(projectPath);
      resetParserState();
      // Run 2
      const r2 = await analyzeProject(projectPath);

      // Compare module imports, imported_by, and exports
      for (let i = 0; i < r1.modules.length; i++) {
        expect(r1.modules[i].imports).toEqual(r2.modules[i].imports);
        expect(r1.modules[i].imported_by).toEqual(r2.modules[i].imported_by);
        for (let j = 0; j < r1.modules[i].files.length; j++) {
          expect(r1.modules[i].files[j].exports).toEqual(r2.modules[i].files[j].exports);
        }
      }
    });
  });

  // ── Sorted output ─────────────────────────────────────────────────────

  describe("sorted output", () => {
    it("exports are sorted by name", async () => {
      await touch(projectPath, "src/lib.ts", `
export function zeta() {}
export function alpha() {}
export function mu() {}
`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const mod = modules.find((m) => m.id === "root");
      const names = mod!.files[0].exports.map((e) => e.name);
      expect(names).toEqual(["alpha", "mu", "zeta"]);
    });

    it("internal imports are sorted by module_id", async () => {
      await touch(projectPath, "src/utils/b/index.ts", `export function b() {}`);
      await touch(projectPath, "src/utils/a/index.ts", `export function a() {}`);
      await touch(projectPath, "src/commands/z/index.ts", `
import { a } from "../../utils/a/index.js";
import { b } from "../../utils/b/index.js";
`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const cmdMod = modules.find((m) => m.id === "commands/z");
      expect(cmdMod).toBeDefined();
      const ids = cmdMod!.imports.internal.map((i) => i.module_id);
      expect(ids).toEqual([...ids].sort());
    });
  });

  // ── Re-exports ────────────────────────────────────────────────────────

  describe("re-exports", () => {
    it("captures re-exports as import relationships", async () => {
      await touch(projectPath, "src/index.ts", `
export { getConfig } from "./utils/index.js";
`);
      await touch(projectPath, "src/utils/index.ts", `
export function getConfig() {}
`);
      await gitCommit(projectPath);

      const { modules } = await analyzeProject(projectPath);

      const rootMod = modules.find((m) => m.id === "root");
      expect(rootMod!.imports.internal).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ module_id: "utils" }),
        ])
      );
    });
  });

  // ── Self-scan ─────────────────────────────────────────────────────────

  describe("self-scan on engraph codebase", () => {
    it("produces non-empty results on the engraph project", async () => {
      const engraphRoot = path.resolve(__dirname, "../../../..");
      const modules = await scanModules(engraphRoot);
      const sourceRoots = await detectSourceRoots(engraphRoot);
      await analyzeImports(engraphRoot, modules, sourceRoots);

      const totalExports = modules.reduce(
        (sum, m) => sum + m.files.reduce((s, f) => s + f.exports.length, 0), 0
      );
      expect(totalExports).toBeGreaterThan(20);

      const totalInternal = modules.reduce(
        (sum, m) => sum + m.imports.internal.length, 0
      );
      expect(totalInternal).toBeGreaterThan(10);

      const totalExternal = modules.reduce(
        (sum, m) => sum + m.imports.external.length, 0
      );
      expect(totalExternal).toBeGreaterThan(10);

      // imported_by should be populated for core modules
      const totalImportedBy = modules.reduce(
        (sum, m) => sum + m.imported_by.length, 0
      );
      expect(totalImportedBy).toBeGreaterThan(5);
    });
  });
});
