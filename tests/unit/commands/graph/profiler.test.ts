import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import {
  detectLanguages,
  detectFrameworks,
  detectPackageManager,
  detectTestFramework,
  determineProjectType,
  detectProjectProfile,
} from "../../../../src/commands/graph/profiler.js";
import { scanModules } from "../../../../src/commands/graph/scanner.js";

// Helper: create a temp project directory with a git repo
async function createTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "engraph-profiler-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
  return dir;
}

// Helper: create a file with content
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

// ─── Unit Tests: detectLanguages ────────────────────────────────────────────

describe("detectLanguages", () => {
  it("detects TypeScript as the dominant language", () => {
    const files = [
      "src/cli.ts",
      "src/commands/init/index.ts",
      "src/commands/init/setup.ts",
      "src/utils/config.ts",
    ];
    const result = detectLanguages(files);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("typescript");
    expect(result[0].percentage).toBe(100);
  });

  it("detects multiple languages with correct percentages", () => {
    const files = [
      "src/app.ts",
      "src/index.ts",
      "src/utils.ts",
      "lib/helper.js",
    ];
    const result = detectLanguages(files);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("typescript");
    expect(result[0].percentage).toBe(75);
    expect(result[1].name).toBe("javascript");
    expect(result[1].percentage).toBe(25);
  });

  it("returns empty array for no source files", () => {
    expect(detectLanguages([])).toEqual([]);
  });

  it("sorts by percentage descending", () => {
    const files = [
      "a.py", "b.py", "c.py",
      "d.ts",
    ];
    const result = detectLanguages(files);
    expect(result[0].name).toBe("python");
    expect(result[1].name).toBe("typescript");
  });
});

// ─── Unit Tests: detectFrameworks ───────────────────────────────────────────

describe("detectFrameworks", () => {
  it("detects commander from package.json", () => {
    const manifests = {
      packageJson: {
        dependencies: { commander: "^12.0.0" },
      },
      cargoToml: null,
      pyprojectToml: null,
      goMod: null,
    };
    const result = detectFrameworks(manifests);
    expect(result.some((f) => f.name === "commander")).toBe(true);
    expect(result.find((f) => f.name === "commander")!.type).toBe("cli");
    expect(result.find((f) => f.name === "commander")!.detected_in).toBe("package.json");
  });

  it("detects vitest from devDependencies", () => {
    const manifests = {
      packageJson: {
        devDependencies: { vitest: "^4.0.0" },
      },
      cargoToml: null,
      pyprojectToml: null,
      goMod: null,
    };
    const result = detectFrameworks(manifests);
    expect(result.some((f) => f.name === "vitest")).toBe(true);
    expect(result.find((f) => f.name === "vitest")!.type).toBe("test");
  });

  it("detects express and react for full-stack", () => {
    const manifests = {
      packageJson: {
        dependencies: { express: "^4.0.0", react: "^18.0.0" },
      },
      cargoToml: null,
      pyprojectToml: null,
      goMod: null,
    };
    const result = detectFrameworks(manifests);
    expect(result.some((f) => f.name === "express" && f.type === "web")).toBe(true);
    expect(result.some((f) => f.name === "react" && f.type === "frontend")).toBe(true);
  });

  it("detects frameworks from Cargo.toml", () => {
    const manifests = {
      packageJson: null,
      cargoToml: '[dependencies]\naxum = "0.7"\ntokio = { version = "1" }',
      pyprojectToml: null,
      goMod: null,
    };
    const result = detectFrameworks(manifests);
    expect(result.some((f) => f.name === "axum")).toBe(true);
  });

  it("detects frameworks from pyproject.toml", () => {
    const manifests = {
      packageJson: null,
      cargoToml: null,
      pyprojectToml: '[project]\ndependencies = ["fastapi>=0.100"]',
      goMod: null,
    };
    const result = detectFrameworks(manifests);
    expect(result.some((f) => f.name === "fastapi")).toBe(true);
  });

  it("detects frameworks from go.mod", () => {
    const manifests = {
      packageJson: null,
      cargoToml: null,
      pyprojectToml: null,
      goMod: 'module example.com/app\nrequire github.com/gin-gonic/gin v1.9.1',
    };
    const result = detectFrameworks(manifests);
    expect(result.some((f) => f.name === "gin")).toBe(true);
  });

  it("returns empty for no manifests", () => {
    const manifests = {
      packageJson: null,
      cargoToml: null,
      pyprojectToml: null,
      goMod: null,
    };
    expect(detectFrameworks(manifests)).toEqual([]);
  });

  it("returns sorted results for determinism", () => {
    const manifests = {
      packageJson: {
        dependencies: { react: "^18.0.0", express: "^4.0.0" },
        devDependencies: { vitest: "^4.0.0" },
      },
      cargoToml: null,
      pyprojectToml: null,
      goMod: null,
    };
    const result = detectFrameworks(manifests);
    const names = result.map((f) => f.name);
    expect(names).toEqual([...names].sort());
  });
});

// ─── Unit Tests: detectPackageManager ───────────────────────────────────────

describe("detectPackageManager", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectPath);
  });

  it("detects npm from package-lock.json", async () => {
    await touch(projectPath, "package.json", "{}");
    await touch(projectPath, "package-lock.json", "{}");
    expect(await detectPackageManager(projectPath)).toBe("npm");
  });

  it("detects pnpm from pnpm-lock.yaml", async () => {
    await touch(projectPath, "package.json", "{}");
    await touch(projectPath, "pnpm-lock.yaml", "");
    expect(await detectPackageManager(projectPath)).toBe("pnpm");
  });

  it("detects yarn from yarn.lock", async () => {
    await touch(projectPath, "package.json", "{}");
    await touch(projectPath, "yarn.lock", "");
    expect(await detectPackageManager(projectPath)).toBe("yarn");
  });

  it("detects cargo from Cargo.lock", async () => {
    await touch(projectPath, "Cargo.toml", "");
    await touch(projectPath, "Cargo.lock", "");
    expect(await detectPackageManager(projectPath)).toBe("cargo");
  });

  it("falls back to npm when only package.json exists", async () => {
    await touch(projectPath, "package.json", "{}");
    expect(await detectPackageManager(projectPath)).toBe("npm");
  });

  it("returns null when no manifests exist", async () => {
    expect(await detectPackageManager(projectPath)).toBeNull();
  });
});

// ─── Unit Tests: detectTestFramework ────────────────────────────────────────

describe("detectTestFramework", () => {
  it("returns vitest when detected in frameworks", () => {
    const frameworks = [
      { name: "commander", type: "cli", detected_in: "package.json" },
      { name: "vitest", type: "test", detected_in: "package.json" },
    ];
    const manifests = { packageJson: null, cargoToml: null, pyprojectToml: null, goMod: null };
    expect(detectTestFramework(manifests, frameworks)).toBe("vitest");
  });

  it("falls back to test script parsing when no test framework in frameworks", () => {
    const manifests = {
      packageJson: {
        scripts: { test: "jest --coverage" },
      },
      cargoToml: null,
      pyprojectToml: null,
      goMod: null,
    };
    expect(detectTestFramework(manifests, [])).toBe("jest");
  });

  it("detects pytest from pyproject.toml", () => {
    const manifests = {
      packageJson: null,
      cargoToml: null,
      pyprojectToml: '[tool.pytest.ini_options]\ntestpaths = ["tests"]',
      goMod: null,
    };
    expect(detectTestFramework(manifests, [])).toBe("pytest");
  });

  it("returns null when no test framework is found", () => {
    const manifests = { packageJson: null, cargoToml: null, pyprojectToml: null, goMod: null };
    expect(detectTestFramework(manifests, [])).toBeNull();
  });
});

// ─── Unit Tests: entry point deduplication ──────────────────────────────────

describe("entry point deduplication", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectPath);
  });

  it("deduplicates ./dist/cli.js and dist/cli.js as the same entry point", async () => {
    await touch(projectPath, "package.json", JSON.stringify({
      name: "test",
      bin: { test: "./dist/cli.js" },
      main: "dist/cli.js",
    }));
    await touch(projectPath, "src/app.ts");
    await gitCommit(projectPath);

    const modules = await scanModules(projectPath);
    const profile = await detectProjectProfile(projectPath, ["src/app.ts"], modules);

    // Should have only one entry for dist/cli.js, not both ./dist/cli.js and dist/cli.js
    const cliPaths = profile.entry_points.filter((e) => e.path.includes("dist/cli.js"));
    expect(cliPaths).toHaveLength(1);
    expect(cliPaths[0].path).toBe("dist/cli.js");
  });
});

// ─── Unit Tests: determineProjectType ───────────────────────────────────────

describe("determineProjectType", () => {
  const emptyManifests = { packageJson: null, cargoToml: null, pyprojectToml: null, goMod: null };

  it("detects CLI project", () => {
    const frameworks = [{ name: "commander", type: "cli", detected_in: "package.json" }];
    const entryPoints = [{ path: "./dist/cli.js", type: "cli" }];
    expect(determineProjectType(emptyManifests, frameworks, entryPoints)).toBe("cli");
  });

  it("detects web-api project", () => {
    const frameworks = [{ name: "express", type: "web", detected_in: "package.json" }];
    expect(determineProjectType(emptyManifests, frameworks, [])).toBe("web-api");
  });

  it("detects full-stack project (web + frontend)", () => {
    const frameworks = [
      { name: "express", type: "web", detected_in: "package.json" },
      { name: "react", type: "frontend", detected_in: "package.json" },
    ];
    expect(determineProjectType(emptyManifests, frameworks, [])).toBe("full-stack");
  });

  it("detects library project", () => {
    const entryPoints = [{ path: "dist/index.js", type: "main" }];
    expect(determineProjectType(emptyManifests, [], entryPoints)).toBe("library");
  });

  it("detects monorepo from workspaces", () => {
    const manifests = {
      packageJson: { workspaces: ["packages/*"] },
      cargoToml: null,
      pyprojectToml: null,
      goMod: null,
    };
    expect(determineProjectType(manifests, [], [])).toBe("monorepo");
  });

  it("returns unknown when no signals", () => {
    expect(determineProjectType(emptyManifests, [], [])).toBe("unknown");
  });
});

// ─── Integration: detectProjectProfile ──────────────────────────────────────

describe("detectProjectProfile", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await createTempProject();
  });

  afterEach(async () => {
    await fs.remove(projectPath);
  });

  it("produces a complete profile for a TypeScript CLI project", async () => {
    // Set up a minimal TS CLI project
    await touch(projectPath, "package.json", JSON.stringify({
      name: "test-cli",
      bin: { "test-cli": "./dist/cli.js" },
      main: "dist/index.js",
      dependencies: { commander: "^12.0.0" },
      devDependencies: { vitest: "^4.0.0" },
      scripts: { test: "vitest run" },
    }));
    await touch(projectPath, "package-lock.json", "{}");
    await touch(projectPath, "src/cli.ts", 'import { Command } from "commander";\nconst program = new Command();\n');
    await touch(projectPath, "src/commands/init/index.ts", "export function init() {}\n");
    await touch(projectPath, "src/utils/config.ts", "export const config = {};\n");
    await touch(projectPath, "tests/unit/init.test.ts", "describe('init', () => {});\n");
    await gitCommit(projectPath);

    const allFiles = [
      "src/cli.ts",
      "src/commands/init/index.ts",
      "src/utils/config.ts",
      "tests/unit/init.test.ts",
    ];
    const modules = await scanModules(projectPath);
    const profile = await detectProjectProfile(projectPath, allFiles, modules);

    // Project type
    expect(profile.type).toBe("cli");

    // Languages
    expect(profile.languages.length).toBeGreaterThan(0);
    expect(profile.languages[0].name).toBe("typescript");

    // Frameworks
    expect(profile.frameworks.some((f) => f.name === "commander")).toBe(true);
    expect(profile.frameworks.some((f) => f.name === "vitest")).toBe(true);

    // Package manager
    expect(profile.package_manager).toBe("npm");

    // Entry points
    expect(profile.entry_points.some((e) => e.type === "cli")).toBe(true);

    // Test framework
    expect(profile.test_framework).toBe("vitest");

    // Scale metrics
    expect(profile.scale.total_files).toBe(4);
    expect(profile.scale.source_files).toBeGreaterThan(0);
    expect(profile.scale.total_loc).toBeGreaterThan(0);
  });

  it("produces deterministic output — two runs yield identical results", async () => {
    await touch(projectPath, "package.json", JSON.stringify({
      name: "test",
      dependencies: { commander: "^12.0.0" },
    }));
    await touch(projectPath, "src/app.ts", "const x = 1;\n");
    await gitCommit(projectPath);

    const allFiles = ["src/app.ts"];
    const modules = await scanModules(projectPath);

    const result1 = await detectProjectProfile(projectPath, allFiles, modules);
    const result2 = await detectProjectProfile(projectPath, allFiles, modules);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it("handles projects with no manifest files", async () => {
    await touch(projectPath, "src/main.py", "print('hello')\n");
    await gitCommit(projectPath);

    const allFiles = ["src/main.py"];
    const modules = await scanModules(projectPath);
    const profile = await detectProjectProfile(projectPath, allFiles, modules);

    expect(profile.type).toBe("unknown");
    expect(profile.languages[0].name).toBe("python");
    expect(profile.package_manager).toBeNull();
    expect(profile.test_framework).toBeNull();
  });
});
