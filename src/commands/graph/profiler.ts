import path from "path";
import fs from "fs-extra";
import { execSync } from "child_process";
import type {
  ProjectProfile,
  ProjectType,
  LanguageEntry,
  FrameworkEntry,
  EntryPoint,
  ScaleMetrics,
  Module,
} from "./types.js";

// ─── Language Detection ─────────────────────────────────────────────────────

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp",
  ".hh": "cpp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".cs": "csharp",
};

// ─── Framework Detection ────────────────────────────────────────────────────

interface FrameworkPattern {
  name: string;
  type: string;
  // Check in package.json dependencies
  packages?: string[];
  // Check in pyproject.toml / requirements.txt
  pythonPackages?: string[];
  // Check in Cargo.toml
  crateNames?: string[];
  // Check in go.mod
  goModules?: string[];
}

const FRAMEWORK_PATTERNS: FrameworkPattern[] = [
  // JS/TS CLI frameworks
  { name: "commander", type: "cli", packages: ["commander"] },
  { name: "yargs", type: "cli", packages: ["yargs"] },
  { name: "oclif", type: "cli", packages: ["@oclif/core", "oclif"] },
  { name: "meow", type: "cli", packages: ["meow"] },
  // JS/TS web frameworks
  { name: "express", type: "web", packages: ["express"] },
  { name: "fastify", type: "web", packages: ["fastify"] },
  { name: "koa", type: "web", packages: ["koa"] },
  { name: "hono", type: "web", packages: ["hono"] },
  { name: "nestjs", type: "web", packages: ["@nestjs/core"] },
  // JS/TS frontend frameworks
  { name: "react", type: "frontend", packages: ["react"] },
  { name: "next", type: "frontend", packages: ["next"] },
  { name: "vue", type: "frontend", packages: ["vue"] },
  { name: "nuxt", type: "frontend", packages: ["nuxt"] },
  { name: "svelte", type: "frontend", packages: ["svelte"] },
  { name: "angular", type: "frontend", packages: ["@angular/core"] },
  // JS/TS test frameworks
  { name: "vitest", type: "test", packages: ["vitest"] },
  { name: "jest", type: "test", packages: ["jest"] },
  { name: "mocha", type: "test", packages: ["mocha"] },
  // Python web frameworks
  { name: "django", type: "web", pythonPackages: ["django", "Django"] },
  { name: "flask", type: "web", pythonPackages: ["flask", "Flask"] },
  { name: "fastapi", type: "web", pythonPackages: ["fastapi"] },
  // Python test frameworks
  { name: "pytest", type: "test", pythonPackages: ["pytest"] },
  // Rust web frameworks
  { name: "axum", type: "web", crateNames: ["axum"] },
  { name: "actix-web", type: "web", crateNames: ["actix-web"] },
  { name: "rocket", type: "web", crateNames: ["rocket"] },
  // Go web frameworks
  { name: "gin", type: "web", goModules: ["github.com/gin-gonic/gin"] },
  { name: "echo", type: "web", goModules: ["github.com/labstack/echo"] },
  { name: "fiber", type: "web", goModules: ["github.com/gofiber/fiber"] },
];

// ─── Package Manager Detection ──────────────────────────────────────────────

interface PackageManagerSignal {
  name: string;
  lockFile: string;
}

const PACKAGE_MANAGER_SIGNALS: PackageManagerSignal[] = [
  { name: "pnpm", lockFile: "pnpm-lock.yaml" },
  { name: "yarn", lockFile: "yarn.lock" },
  { name: "bun", lockFile: "bun.lockb" },
  { name: "npm", lockFile: "package-lock.json" },
  // Python
  { name: "pip", lockFile: "requirements.txt" },
  { name: "poetry", lockFile: "poetry.lock" },
  { name: "uv", lockFile: "uv.lock" },
  // Rust
  { name: "cargo", lockFile: "Cargo.lock" },
  // Go
  { name: "go", lockFile: "go.sum" },
];

// ─── Test Framework Detection ───────────────────────────────────────────────

const TEST_FRAMEWORK_PACKAGES: Record<string, string> = {
  vitest: "vitest",
  jest: "jest",
  mocha: "mocha",
  jasmine: "jasmine",
  ava: "ava",
  tap: "tap",
  pytest: "pytest",
  unittest: "unittest",
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a complete ProjectProfile from the project's files and manifests.
 *
 * Takes the already-collected list of all source files (from scanModules)
 * and the project path to read manifests.
 */
export async function detectProjectProfile(
  projectPath: string,
  allFiles: string[],
  modules: Module[],
  options: { debug?: boolean } = {}
): Promise<ProjectProfile> {
  const { debug = false } = options;

  // Gather all file paths from modules (source + test)
  const sourceFilePaths: string[] = [];
  const testFilePaths: string[] = [];
  for (const mod of modules) {
    for (const f of mod.files) {
      sourceFilePaths.push(f.path);
    }
    testFilePaths.push(...mod.test_files);
  }

  // 1. Detect languages from file extensions
  const languages = detectLanguages(allFiles);
  if (debug) console.log(`[profiler] languages: ${languages.map((l) => l.name).join(", ")}`);

  // 2. Read manifests for framework/package detection
  const manifests = await readManifests(projectPath);

  // 3. Detect frameworks
  const frameworks = detectFrameworks(manifests);
  if (debug) console.log(`[profiler] frameworks: ${frameworks.map((f) => f.name).join(", ")}`);

  // 4. Detect package manager
  const packageManager = await detectPackageManager(projectPath);
  if (debug) console.log(`[profiler] package manager: ${packageManager ?? "none"}`);

  // 5. Detect entry points
  const entryPoints = await detectEntryPoints(projectPath, manifests);
  if (debug) console.log(`[profiler] entry points: ${entryPoints.length}`);

  // 6. Detect test framework
  const testFramework = detectTestFramework(manifests, frameworks);
  if (debug) console.log(`[profiler] test framework: ${testFramework ?? "none"}`);

  // 7. Compute scale metrics
  const scale = await computeScale(projectPath, allFiles, sourceFilePaths, testFilePaths);
  if (debug) console.log(`[profiler] scale: ${scale.source_files} source, ${scale.test_files} test, ${scale.total_loc} LOC`);

  // 8. Determine project type
  const projectType = determineProjectType(manifests, frameworks, entryPoints);
  if (debug) console.log(`[profiler] project type: ${projectType}`);

  return {
    type: projectType,
    languages,
    frameworks,
    package_manager: packageManager,
    entry_points: entryPoints,
    test_framework: testFramework,
    scale,
  };
}

// ─── Manifest Reading ───────────────────────────────────────────────────────

interface Manifests {
  packageJson: Record<string, unknown> | null;
  cargoToml: string | null;
  pyprojectToml: string | null;
  goMod: string | null;
}

async function readManifests(projectPath: string): Promise<Manifests> {
  const manifests: Manifests = {
    packageJson: null,
    cargoToml: null,
    pyprojectToml: null,
    goMod: null,
  };

  // package.json
  try {
    const pkgPath = path.join(projectPath, "package.json");
    if (await fs.pathExists(pkgPath)) {
      manifests.packageJson = await fs.readJson(pkgPath);
    }
  } catch { /* ignore parse errors */ }

  // Cargo.toml
  try {
    const cargoPath = path.join(projectPath, "Cargo.toml");
    if (await fs.pathExists(cargoPath)) {
      manifests.cargoToml = await fs.readFile(cargoPath, "utf8");
    }
  } catch { /* ignore */ }

  // pyproject.toml
  try {
    const pyPath = path.join(projectPath, "pyproject.toml");
    if (await fs.pathExists(pyPath)) {
      manifests.pyprojectToml = await fs.readFile(pyPath, "utf8");
    }
  } catch { /* ignore */ }

  // go.mod
  try {
    const goPath = path.join(projectPath, "go.mod");
    if (await fs.pathExists(goPath)) {
      manifests.goMod = await fs.readFile(goPath, "utf8");
    }
  } catch { /* ignore */ }

  return manifests;
}

// ─── Language Detection ─────────────────────────────────────────────────────

export function detectLanguages(files: string[]): LanguageEntry[] {
  const counts = new Map<string, number>();
  let total = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const lang = EXTENSION_TO_LANGUAGE[ext];
    if (lang) {
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
      total++;
    }
  }

  if (total === 0) return [];

  const entries: LanguageEntry[] = [];
  for (const [name, count] of counts) {
    entries.push({
      name,
      percentage: Math.round((count / total) * 100 * 10) / 10,
    });
  }

  // Sort by percentage descending, then by name for determinism
  entries.sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name));

  return entries;
}

// ─── Framework Detection ────────────────────────────────────────────────────

export function detectFrameworks(manifests: Manifests): FrameworkEntry[] {
  const detected: FrameworkEntry[] = [];

  for (const pattern of FRAMEWORK_PATTERNS) {
    // Check package.json dependencies
    if (pattern.packages && manifests.packageJson) {
      const pkg = manifests.packageJson;
      const allDeps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };

      for (const pkgName of pattern.packages) {
        if (pkgName in allDeps) {
          detected.push({
            name: pattern.name,
            type: pattern.type,
            detected_in: "package.json",
          });
          break;
        }
      }
    }

    // Check Python manifests
    if (pattern.pythonPackages) {
      const pyContent = manifests.pyprojectToml ?? "";
      for (const pkg of pattern.pythonPackages) {
        if (pyContent.includes(pkg)) {
          detected.push({
            name: pattern.name,
            type: pattern.type,
            detected_in: "pyproject.toml",
          });
          break;
        }
      }
    }

    // Check Cargo.toml
    if (pattern.crateNames && manifests.cargoToml) {
      for (const crate of pattern.crateNames) {
        if (manifests.cargoToml.includes(crate)) {
          detected.push({
            name: pattern.name,
            type: pattern.type,
            detected_in: "Cargo.toml",
          });
          break;
        }
      }
    }

    // Check go.mod
    if (pattern.goModules && manifests.goMod) {
      for (const mod of pattern.goModules) {
        if (manifests.goMod.includes(mod)) {
          detected.push({
            name: pattern.name,
            type: pattern.type,
            detected_in: "go.mod",
          });
          break;
        }
      }
    }
  }

  // Sort for deterministic output
  detected.sort((a, b) => a.name.localeCompare(b.name));

  return detected;
}

// ─── Package Manager Detection ──────────────────────────────────────────────

export async function detectPackageManager(
  projectPath: string
): Promise<string | null> {
  // Check lock files in priority order (more specific first)
  for (const signal of PACKAGE_MANAGER_SIGNALS) {
    const lockPath = path.join(projectPath, signal.lockFile);
    if (await fs.pathExists(lockPath)) {
      return signal.name;
    }
  }

  // Fall back to manifest presence
  if (await fs.pathExists(path.join(projectPath, "package.json"))) return "npm";
  if (await fs.pathExists(path.join(projectPath, "Cargo.toml"))) return "cargo";
  if (await fs.pathExists(path.join(projectPath, "go.mod"))) return "go";
  if (await fs.pathExists(path.join(projectPath, "pyproject.toml"))) return "pip";

  return null;
}

// ─── Entry Point Detection ──────────────────────────────────────────────────

async function detectEntryPoints(
  projectPath: string,
  manifests: Manifests
): Promise<EntryPoint[]> {
  const entryPoints: EntryPoint[] = [];

  if (manifests.packageJson) {
    const pkg = manifests.packageJson;

    // bin field — CLI entry points
    if (typeof pkg.bin === "string") {
      entryPoints.push({ path: pkg.bin, type: "cli" });
    } else if (typeof pkg.bin === "object" && pkg.bin !== null) {
      for (const [, binPath] of Object.entries(pkg.bin as Record<string, string>)) {
        entryPoints.push({ path: binPath, type: "cli" });
      }
    }

    // main field — library/app entry point
    if (typeof pkg.main === "string" && !entryPoints.some((e) => e.path === pkg.main)) {
      entryPoints.push({ path: pkg.main as string, type: "main" });
    }

    // module field — ESM entry point
    if (typeof pkg.module === "string") {
      entryPoints.push({ path: pkg.module as string, type: "module" });
    }

    // exports field (simplified — just string values)
    if (typeof pkg.exports === "string") {
      entryPoints.push({ path: pkg.exports, type: "export" });
    } else if (typeof pkg.exports === "object" && pkg.exports !== null) {
      const exportsObj = pkg.exports as Record<string, unknown>;
      for (const [key, value] of Object.entries(exportsObj)) {
        if (typeof value === "string") {
          entryPoints.push({ path: value, type: "export" });
        }
      }
    }
  }

  // Cargo.toml — check for [[bin]] sections and src/main.rs
  if (manifests.cargoToml) {
    if (await fs.pathExists(path.join(projectPath, "src/main.rs"))) {
      entryPoints.push({ path: "src/main.rs", type: "cli" });
    }
    if (await fs.pathExists(path.join(projectPath, "src/lib.rs"))) {
      entryPoints.push({ path: "src/lib.rs", type: "library" });
    }
  }

  // go.mod — check for main.go
  if (manifests.goMod) {
    if (await fs.pathExists(path.join(projectPath, "main.go"))) {
      entryPoints.push({ path: "main.go", type: "cli" });
    }
    if (await fs.pathExists(path.join(projectPath, "cmd"))) {
      entryPoints.push({ path: "cmd/", type: "cli" });
    }
  }

  // Deduplicate by normalized path (strip leading ./)
  const seen = new Set<string>();
  const unique: EntryPoint[] = [];
  for (const ep of entryPoints) {
    const normalized = ep.path.replace(/^\.\//, "");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push({ ...ep, path: normalized });
    }
  }

  return unique;
}

// ─── Test Framework Detection ───────────────────────────────────────────────

export function detectTestFramework(
  manifests: Manifests,
  frameworks: FrameworkEntry[]
): string | null {
  // First check frameworks already detected
  const testFramework = frameworks.find((f) => f.type === "test");
  if (testFramework) return testFramework.name;

  // Check package.json scripts for test runner hints
  if (manifests.packageJson) {
    const scripts = manifests.packageJson.scripts as Record<string, string> | undefined;
    if (scripts) {
      const testScript = scripts.test ?? "";
      for (const [fw, keyword] of Object.entries(TEST_FRAMEWORK_PACKAGES)) {
        if (testScript.includes(keyword)) return fw;
      }
    }
  }

  // Python: check for pytest in pyproject.toml
  if (manifests.pyprojectToml?.includes("pytest")) return "pytest";

  return null;
}

// ─── Scale Metrics ──────────────────────────────────────────────────────────

async function computeScale(
  projectPath: string,
  allFiles: string[],
  sourceFiles: string[],
  testFiles: string[]
): Promise<ScaleMetrics> {
  const sourceFileCount = sourceFiles.length;
  const testFileCount = testFiles.length;
  const totalFileCount = allFiles.length;

  // Count lines of code
  let sourceLoc = 0;
  let testLoc = 0;

  // Use a set for fast lookup
  const testFileSet = new Set(testFiles);

  for (const file of allFiles) {
    const loc = await countLines(path.join(projectPath, file));
    if (testFileSet.has(file)) {
      testLoc += loc;
    } else {
      sourceLoc += loc;
    }
  }

  return {
    total_files: totalFileCount,
    source_files: sourceFileCount,
    test_files: testFileCount,
    total_loc: sourceLoc + testLoc,
    source_loc: sourceLoc,
    test_loc: testLoc,
  };
}

async function countLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    if (content.length === 0) return 0;
    // Count non-empty lines
    return content.split("\n").filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

// ─── Project Type Detection ─────────────────────────────────────────────────

export function determineProjectType(
  manifests: Manifests,
  frameworks: FrameworkEntry[],
  entryPoints: EntryPoint[]
): ProjectType {
  // Monorepo detection — workspaces in package.json, lerna.json, pnpm-workspace.yaml
  if (manifests.packageJson) {
    const pkg = manifests.packageJson;
    if (pkg.workspaces) return "monorepo";
  }

  const hasWebFramework = frameworks.some((f) => f.type === "web");
  const hasFrontendFramework = frameworks.some((f) => f.type === "frontend");
  const hasCliFramework = frameworks.some((f) => f.type === "cli");
  const hasCliBin = entryPoints.some((e) => e.type === "cli");

  // Full-stack: both web and frontend
  if (hasWebFramework && hasFrontendFramework) return "full-stack";

  // CLI: has cli framework or bin entry points (and no web framework)
  if ((hasCliFramework || hasCliBin) && !hasWebFramework && !hasFrontendFramework) return "cli";

  // Web API: has web framework
  if (hasWebFramework) return "web-api";

  // Frontend app
  if (hasFrontendFramework) return "full-stack";

  // Library: has main/module/exports entry points but no framework signals
  const hasLibEntryPoint = entryPoints.some((e) =>
    e.type === "main" || e.type === "module" || e.type === "export" || e.type === "library"
  );
  if (hasLibEntryPoint && !hasCliBin) return "library";

  return "unknown";
}
