import path from "path";
import fs from "fs-extra";
import { execSync } from "child_process";
import type { Module, ModuleType, FileEntry } from "./types.js";

// Source file extensions by language ecosystem
const SOURCE_EXTENSIONS = new Set([
  // TypeScript / JavaScript
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  // Python
  ".py",
  // Rust
  ".rs",
  // Go
  ".go",
  // Java / Kotlin
  ".java", ".kt", ".kts",
  // C / C++
  ".c", ".h", ".cpp", ".hpp", ".cc", ".hh",
  // Ruby
  ".rb",
  // PHP
  ".php",
  // Swift
  ".swift",
  // C#
  ".cs",
]);

// Index files that mark explicit modules
const INDEX_FILES = new Set([
  "index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs",
  "mod.rs",
  "mod.ts",
  "__init__.py",
  "main.go",
]);

// Test directory patterns
const TEST_DIR_PATTERNS = [
  /^tests?$/i,
  /^__tests__$/i,
  /^spec$/i,
  /^__spec__$/i,
];

// Utility directory patterns
const UTILITY_DIR_PATTERNS = [
  /^utils?$/i,
  /^helpers?$/i,
  /^shared$/i,
  /^common$/i,
  /^lib$/i,
];

// Core / infrastructure directory patterns
const CORE_DIR_PATTERNS = [
  /^core$/i,
  /^internal$/i,
  /^kernel$/i,
];

// Entry point directory patterns
const ENTRY_DIR_PATTERNS = [
  /^commands?$/i,
  /^routes?$/i,
  /^pages?$/i,
  /^api$/i,
  /^handlers?$/i,
  /^endpoints?$/i,
];

/**
 * Scan a project directory and produce a list of modules.
 *
 * This implements Layer 1 of the codegraph generation:
 * - Walk the source tree respecting .gitignore
 * - Detect modules from directory structure
 * - Classify module types (feature, utility, core, entry, test)
 * - Generate deterministic module IDs from paths
 * - Associate test files with their source modules via convention-based
 *   path matching (test directory structure mirrors source structure)
 */
export async function scanModules(
  projectPath: string,
  options: { debug?: boolean } = {}
): Promise<Module[]> {
  const { debug = false } = options;

  // Detect the source root(s) — most projects have a top-level src/ or similar
  const sourceRoots = await detectSourceRoots(projectPath);

  if (debug) {
    console.log(`[scanner] source roots: ${sourceRoots.join(", ") || "(project root)"}`);
  }

  // Collect all tracked source files using git ls-files (respects .gitignore)
  const allFiles = await listTrackedSourceFiles(projectPath);

  if (debug) {
    console.log(`[scanner] tracked source files: ${allFiles.length}`);
  }

  // ── Step 1: Separate source files from test files ────────────────────
  const srcFiles: string[] = [];
  const testFiles: string[] = [];

  for (const file of allFiles) {
    if (isTestFile(file)) {
      testFiles.push(file);
    } else {
      srcFiles.push(file);
    }
  }

  // Filter source files to those under source roots or in subdirectories
  const relevantSrcFiles = sourceRoots.length > 0
    ? srcFiles.filter((f) => sourceRoots.some((r) => f.startsWith(r + "/")) || f.includes("/"))
    : srcFiles;

  if (debug) {
    console.log(`[scanner] source: ${relevantSrcFiles.length}, test: ${testFiles.length}`);
  }

  // ── Step 2: Group source files by directory → modules ────────────────
  const dirFiles = groupFilesByDirectory(relevantSrcFiles, sourceRoots);
  const modules: Module[] = [];

  for (const [moduleId, files] of dirFiles.entries()) {
    const relativeDirPath = moduleIdToRelativePath(moduleId, sourceRoots, files);
    const moduleType = classifyModuleType(moduleId, files, sourceRoots);

    modules.push({
      id: moduleId,
      path: relativeDirPath,
      type: moduleType,
      files: files.map((f) => ({ path: f, exports: [] })),
      imports: { internal: [], external: [] },
      imported_by: [],
      test_files: [],
    });
  }

  // ── Step 3: Associate test files with source modules ─────────────────
  // Convention-based: match test files to source modules using directory
  // mirroring and filename matching. No test-type modules are created.
  const sourceModuleIds = new Set(modules.map((m) => m.id));
  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  // Build source file → module ID lookup for filename-based matching
  const sourceFileToModule = new Map<string, string>();
  for (const mod of modules) {
    for (const file of mod.files) {
      sourceFileToModule.set(file.path, mod.id);
    }
  }

  const unmatchedTestFiles: string[] = [];

  for (const testFile of testFiles) {
    const matchedModuleId = matchTestFileToSourceModule(
      testFile, sourceModuleIds, sourceFileToModule
    );
    if (matchedModuleId) {
      moduleMap.get(matchedModuleId)!.test_files.push(testFile);
    } else {
      unmatchedTestFiles.push(testFile);
    }
  }

  if (debug && unmatchedTestFiles.length > 0) {
    console.log(`[scanner] ${unmatchedTestFiles.length} test files unmatched`);
  }

  // Sort test_files within each module for deterministic output
  for (const mod of modules) {
    mod.test_files.sort();
  }

  // Sort modules by ID for deterministic output
  modules.sort((a, b) => a.id.localeCompare(b.id));

  if (debug) {
    console.log(`[scanner] detected ${modules.length} modules`);
  }

  return modules;
}

/**
 * Match a test file to a source module using convention-based matching.
 *
 * Two strategies are tried in order:
 *
 * 1. **Directory matching** — progressively strip leading path segments from the
 *    test file's directory until a source module ID matches:
 *      tests/unit/commands/graph/scanner.test.ts → commands/graph
 *      spec/models/user_spec.rb                  → models
 *
 * 2. **Filename matching** — extract the tested module name from the test filename
 *    and find a source module containing a file with that base name:
 *      tests/test_models.py → "models" → module containing models.py
 *      tests/scanner.test.ts → "scanner" → module containing scanner.ts
 *
 * Falls back to "root" if it exists and no better match is found.
 */
function matchTestFileToSourceModule(
  testFile: string,
  sourceModuleIds: Set<string>,
  sourceFileToModule: Map<string, string>
): string | null {
  const dir = path.dirname(testFile).replace(/\\/g, "/");
  const segments = dir.split("/");

  // Strategy 1: Progressively strip leading directory segments
  for (let i = 1; i < segments.length; i++) {
    const candidate = segments.slice(i).join("/");
    if (sourceModuleIds.has(candidate)) {
      return candidate;
    }
  }

  // Strategy 2: Filename-based matching
  // Extract the core name from test file conventions:
  //   scanner.test.ts → scanner
  //   test_models.py  → models
  //   user_spec.rb    → user
  const basename = path.basename(testFile);
  const coreName = basename
    .replace(/\.(test|spec)\.[^.]+$/, "")  // scanner.test.ts → scanner
    .replace(/^test_/, "")                  // test_models.py → models.py → models
    .replace(/_test\.[^.]+$/, "")           // models_test.go → models
    .replace(/_spec\.[^.]+$/, "")           // user_spec.rb → user
    .replace(/\.[^.]+$/, "");               // strip remaining extension

  if (coreName) {
    for (const [srcFile, moduleId] of sourceFileToModule) {
      const srcBasename = path.basename(srcFile);
      const srcName = srcBasename.replace(/\.[^.]+$/, "");
      if (srcName === coreName) {
        return moduleId;
      }
    }
  }

  // Fallback: match to "root" for general test infrastructure
  if (sourceModuleIds.has("root")) {
    return "root";
  }

  return null;
}

/**
 * Detect the source root directories in a project.
 *
 * Looks for common source root patterns: src/, lib/, app/, source/.
 * Returns relative paths from the project root. If no conventional
 * source root is found, returns an empty array (project root is used).
 */
export async function detectSourceRoots(projectPath: string): Promise<string[]> {
  const candidates = ["src", "lib", "app", "source"];
  const roots: string[] = [];

  for (const candidate of candidates) {
    const candidatePath = path.join(projectPath, candidate);
    if (await fs.pathExists(candidatePath)) {
      const stat = await fs.stat(candidatePath);
      if (stat.isDirectory()) {
        roots.push(candidate);
      }
    }
  }

  return roots;
}

/**
 * List all tracked source files using `git ls-files`.
 *
 * This respects .gitignore automatically. Falls back to a manual
 * filesystem walk if git is not available.
 */
export async function listTrackedSourceFiles(
  projectPath: string
): Promise<string[]> {
  let rawFiles: string[];

  try {
    // Use git ls-files for .gitignore-aware file listing.
    // --cached: tracked files; --others --exclude-standard: untracked but not ignored
    const output = execSync(
      "git ls-files --cached --others --exclude-standard",
      {
        cwd: projectPath,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 50 * 1024 * 1024,
      }
    ).trim();
    rawFiles = output ? output.split("\n") : [];
  } catch {
    // Not a git repo or git not available — fallback to manual walk
    rawFiles = await walkDirectory(projectPath, projectPath);
  }

  // Filter to source files only
  return rawFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return SOURCE_EXTENSIONS.has(ext);
  });
}

/**
 * Fallback directory walker when git is not available.
 * Skips node_modules, dist, .git, and similar directories.
 */
async function walkDirectory(
  dir: string,
  projectRoot: string
): Promise<string[]> {
  const SKIP_DIRS = new Set([
    "node_modules", "dist", "build", ".git", ".engraph",
    ".next", ".nuxt", "__pycache__", ".pytest_cache",
    "target", "vendor", ".venv", "venv",
    "coverage", ".idea", ".vscode",
  ]);

  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const nested = await walkDirectory(fullPath, projectRoot);
      results.push(...nested);
    } else if (entry.isFile()) {
      results.push(path.relative(projectRoot, fullPath));
    }
  }

  return results;
}

/**
 * Group source files by their directory and produce module IDs.
 *
 * Module IDs are path-derived, relative to the source root.
 * For example, `src/commands/init/index.ts` → module ID `commands/init`.
 *
 * Only source files are grouped here — test files are associated
 * separately via convention-based matching in scanModules.
 */
function groupFilesByDirectory(
  files: string[],
  sourceRoots: string[]
): Map<string, string[]> {
  const dirFiles = new Map<string, string[]>();

  for (const file of files) {
    const dir = path.dirname(file);
    const moduleId = deriveModuleId(dir, sourceRoots);

    if (!dirFiles.has(moduleId)) {
      dirFiles.set(moduleId, []);
    }
    dirFiles.get(moduleId)!.push(file);
  }

  return dirFiles;
}

/**
 * Derive a deterministic module ID from a file's directory path.
 *
 * The source root prefix (e.g., `src/`) is stripped, producing clean IDs:
 *   - `src/commands/init` → `commands/init`
 *   - `src/utils/config`  → `utils/config`
 *   - `tests/unit/commands` → `tests/unit/commands`
 *
 * If the file is at the source root itself, returns `"root"`.
 */
export function deriveModuleId(
  dirPath: string,
  sourceRoots: string[]
): string {
  // Normalize to forward slashes
  const normalized = dirPath.replace(/\\/g, "/");

  // Try stripping each source root prefix
  for (const root of sourceRoots) {
    const prefix = root + "/";
    if (normalized.startsWith(prefix)) {
      const stripped = normalized.slice(prefix.length);
      return stripped || "root";
    }
    if (normalized === root) {
      return "root";
    }
  }

  // Not under a source root — use the path as-is, or "root" if top-level
  if (normalized === "" || normalized === ".") {
    return "root";
  }

  return normalized;
}

/**
 * Convert a module ID back to a relative directory path.
 *
 * Uses the file-to-source-root mapping to determine the correct prefix.
 * Modules not under any source root (e.g., tests/) use their ID as the path.
 */
function moduleIdToRelativePath(
  moduleId: string,
  sourceRoots: string[],
  files: string[]
): string {
  if (moduleId === "root") {
    return sourceRoots.length > 0 ? sourceRoots[0] + "/" : ".";
  }

  // Determine which source root this module's files actually live under
  for (const root of sourceRoots) {
    const prefix = root + "/" + moduleId + "/";
    const rootExact = root + "/" + moduleId;
    if (files.some((f) => f.startsWith(prefix) || path.dirname(f) === rootExact)) {
      return root + "/" + moduleId;
    }
  }

  // Not under any source root — use the module ID as-is
  return moduleId;
}

/**
 * Classify a module's type based on its directory name and position.
 */
function classifyModuleType(
  moduleId: string,
  files: string[],
  sourceRoots: string[]
): ModuleType {
  const segments = moduleId.split("/");
  const dirName = segments[segments.length - 1];
  const parentName = segments.length > 1 ? segments[segments.length - 2] : null;

  // "root" module at the source root level
  if (moduleId === "root") {
    return "entry";
  }

  // Test modules — directory name matches test patterns, or the module
  // lives under a top-level test directory
  if (TEST_DIR_PATTERNS.some((p) => p.test(dirName))) {
    return "test";
  }
  if (segments.length > 0 && TEST_DIR_PATTERNS.some((p) => p.test(segments[0]))) {
    return "test";
  }

  // Utility modules
  if (UTILITY_DIR_PATTERNS.some((p) => p.test(dirName))) {
    return "utility";
  }

  // Core / infrastructure modules
  if (CORE_DIR_PATTERNS.some((p) => p.test(dirName))) {
    return "core";
  }

  // Entry point modules — commands, routes, handlers
  if (ENTRY_DIR_PATTERNS.some((p) => p.test(dirName))) {
    return "entry";
  }
  // Sub-commands are also entry points (e.g., commands/init)
  if (parentName && ENTRY_DIR_PATTERNS.some((p) => p.test(parentName))) {
    return "entry";
  }

  // Default: feature module
  return "feature";
}

/**
 * Check if a file path looks like a test file.
 */
function isTestFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  const lowerBasename = basename.toLowerCase();

  // Common test file patterns
  if (lowerBasename.includes(".test.") || lowerBasename.includes(".spec.")) {
    return true;
  }
  if (lowerBasename.startsWith("test_") || lowerBasename.startsWith("test.")) {
    return true;
  }

  // Files inside test directories
  const dir = path.dirname(filePath).replace(/\\/g, "/");
  const segments = dir.split("/");
  return segments.some((s) => TEST_DIR_PATTERNS.some((p) => p.test(s)));
}
