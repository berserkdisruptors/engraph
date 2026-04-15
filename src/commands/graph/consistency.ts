/**
 * Consistency reports — deterministic pattern observations computed from
 * the codegraph's AST data. These are ephemeral (not persisted to disk)
 * and serve as grounding for the /context-extract skill's convention
 * and verification suggestions.
 *
 * Four report categories:
 *  1. Naming patterns per declaration type
 *  2. Module interface patterns per module
 *  3. Dependency direction facts
 *  4. Linter/formatter config detection
 */

import path from "path";
import fs from "fs-extra";
import type { Module, SymbolKind, ProjectProfile } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────

export type NamingConvention =
  | "camelCase"
  | "PascalCase"
  | "SCREAMING_SNAKE_CASE"
  | "snake_case"
  | "kebab-case"
  | "mixed";

export type DeclarationType =
  | "function"
  | "class"
  | "constant"
  | "type"
  | "file"
  | "testFile";

export interface ModuleBreakdown {
  moduleId: string;
  matchCount: number;
  totalCount: number;
}

export interface NamingPattern {
  declarationType: DeclarationType;
  pattern: NamingConvention;
  matchCount: number;
  totalCount: number;
  deviations: string[];
  byModule: ModuleBreakdown[];
}

export interface ModuleInterfacePattern {
  moduleId: string;
  hasReexportEntry: boolean;
  exportVisibility: Record<string, number>;
  commonImports: string[];
}

export interface HubModule {
  moduleId: string;
  inboundCount: number;
}

export interface DependencyDirection {
  leafModules: string[];
  hubModules: HubModule[];
  circularDependencies: string[][];
}

export interface DetectedTool {
  name: string;
  configFile: string;
}

export interface LinterFormatterConfig {
  tools: DetectedTool[];
}

export interface ConsistencyReport {
  namingPatterns: NamingPattern[];
  moduleInterfaces: ModuleInterfacePattern[];
  dependencyDirection: DependencyDirection;
  linterFormatterConfig: LinterFormatterConfig;
}

/**
 * Per-file import data collected during analyzer pass 2.
 * moduleId → filePath → imported identifier names
 */
export type FileImportMap = Map<string, Map<string, string[]>>;

// ─── Index file patterns (reused from scanner) ───────────────────────────

const INDEX_BASENAMES = new Set([
  "index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs",
  "mod.rs", "mod.ts",
  "__init__.py",
  "main.go",
]);

// ─── Naming Classification ────────────────────────────────────────────────

const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/;
const SCREAMING_SNAKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;
const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

export function classifyName(name: string): NamingConvention {
  if (SCREAMING_SNAKE.test(name)) return "SCREAMING_SNAKE_CASE";
  if (SNAKE_CASE.test(name)) return "snake_case";
  if (KEBAB_CASE.test(name)) return "kebab-case";
  if (PASCAL_CASE.test(name)) return "PascalCase";
  if (CAMEL_CASE.test(name)) return "camelCase";
  // Single-word lowercase matches both camelCase and snake_case — use camelCase
  if (/^[a-z][a-z0-9]*$/.test(name)) return "camelCase";
  // Single-word uppercase matches both PascalCase and SCREAMING — use PascalCase
  if (/^[A-Z][A-Z0-9]*$/.test(name)) return "PascalCase";
  return "mixed";
}

// ─── Maximum deviations to report ─────────────────────────────────────────

const MAX_DEVIATIONS = 10;

// ─── 1. Naming Pattern Detection ──────────────────────────────────────────

export function computeNamingPatterns(modules: Module[]): NamingPattern[] {
  const results: NamingPattern[] = [];

  // Symbol-based declaration types mapped from SymbolKind
  const symbolKindToDeclarationType: Record<string, DeclarationType> = {
    function: "function",
    class: "class",
    constant: "constant",
    type: "type",
    interface: "type",
    enum: "constant",
  };

  // Group exported symbols by declaration type across all modules
  const declTypeToNames = new Map<DeclarationType, Map<string, string[]>>();
  // declType → moduleId → names[]

  for (const mod of modules) {
    for (const file of mod.files) {
      for (const exp of file.exports) {
        const declType = symbolKindToDeclarationType[exp.type] ?? "function";
        if (!declTypeToNames.has(declType)) {
          declTypeToNames.set(declType, new Map());
        }
        const moduleMap = declTypeToNames.get(declType)!;
        if (!moduleMap.has(mod.id)) {
          moduleMap.set(mod.id, []);
        }
        moduleMap.get(mod.id)!.push(exp.name);
      }
    }
  }

  // File name patterns
  const fileNamesByModule = new Map<string, string[]>();
  for (const mod of modules) {
    const names: string[] = [];
    for (const file of mod.files) {
      const basename = path.basename(file.path);
      const nameWithoutExt = basename.replace(/\.[^.]+$/, "");
      // Skip index files — they're structural, not naming convention signals
      if (!INDEX_BASENAMES.has(basename)) {
        names.push(nameWithoutExt);
      }
    }
    if (names.length > 0) {
      fileNamesByModule.set(mod.id, names);
    }
  }

  // Test file name patterns
  const testNamesByModule = new Map<string, string[]>();
  for (const mod of modules) {
    const names: string[] = [];
    for (const tf of mod.test_files) {
      const basename = path.basename(tf);
      const nameWithoutExt = basename.replace(/\.[^.]+$/, "");
      names.push(nameWithoutExt);
    }
    if (names.length > 0) {
      testNamesByModule.set(mod.id, names);
    }
  }

  // Process symbol-based declaration types
  for (const [declType, moduleMap] of declTypeToNames) {
    const pattern = computePatternForGroup(declType, moduleMap);
    if (pattern) results.push(pattern);
  }

  // Process file names
  if (fileNamesByModule.size > 0) {
    const pattern = computePatternForGroup("file", fileNamesByModule);
    if (pattern) results.push(pattern);
  }

  // Process test file names
  if (testNamesByModule.size > 0) {
    const pattern = computePatternForGroup("testFile", testNamesByModule);
    if (pattern) results.push(pattern);
  }

  return results.sort((a, b) =>
    a.declarationType.localeCompare(b.declarationType)
  );
}

function computePatternForGroup(
  declType: DeclarationType,
  moduleMap: Map<string, string[]>
): NamingPattern | null {
  // Count all conventions globally
  const globalCounts = new Map<NamingConvention, number>();
  const allNames: Array<{ name: string; convention: NamingConvention }> = [];

  // Per-module tracking
  const moduleCounts = new Map<string, Map<NamingConvention, number>>();
  const moduleTotals = new Map<string, number>();

  for (const [moduleId, names] of moduleMap) {
    const counts = new Map<NamingConvention, number>();
    for (const name of names) {
      const conv = classifyName(name);
      allNames.push({ name, convention: conv });
      globalCounts.set(conv, (globalCounts.get(conv) ?? 0) + 1);
      counts.set(conv, (counts.get(conv) ?? 0) + 1);
    }
    moduleCounts.set(moduleId, counts);
    moduleTotals.set(moduleId, names.length);
  }

  if (allNames.length === 0) return null;

  // Find dominant pattern
  let dominant: NamingConvention = "mixed";
  let dominantCount = 0;
  for (const [conv, count] of globalCounts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominant = conv;
    }
  }

  // Collect deviations
  const deviations = allNames
    .filter((n) => n.convention !== dominant)
    .map((n) => n.name)
    .slice(0, MAX_DEVIATIONS);

  // Build per-module breakdown
  const byModule: ModuleBreakdown[] = [];
  for (const [moduleId, counts] of moduleCounts) {
    byModule.push({
      moduleId,
      matchCount: counts.get(dominant) ?? 0,
      totalCount: moduleTotals.get(moduleId)!,
    });
  }
  byModule.sort((a, b) => a.moduleId.localeCompare(b.moduleId));

  return {
    declarationType: declType,
    pattern: dominant,
    matchCount: dominantCount,
    totalCount: allNames.length,
    deviations,
    byModule,
  };
}

// ─── 2. Module Interface Pattern Detection ────────────────────────────────

export function computeModuleInterfacePatterns(
  modules: Module[],
  fileImportMap: FileImportMap
): ModuleInterfacePattern[] {
  const results: ModuleInterfacePattern[] = [];

  for (const mod of modules) {
    if (mod.files.length === 0) continue;

    // hasReexportEntry: check if any file is an index/entry file with exports
    const hasReexportEntry = mod.files.some((file) => {
      const basename = path.basename(file.path);
      return INDEX_BASENAMES.has(basename) && file.exports.length > 0;
    });

    // exportVisibility: count exports by SymbolKind
    const exportVisibility: Record<string, number> = {};
    for (const file of mod.files) {
      for (const exp of file.exports) {
        exportVisibility[exp.type] = (exportVisibility[exp.type] ?? 0) + 1;
      }
    }

    // commonImports: identifiers imported by 2+ files within the same module
    const identifierCounts = new Map<string, number>();
    const moduleFileImports = fileImportMap.get(mod.id);
    if (moduleFileImports) {
      for (const [_filePath, identifiers] of moduleFileImports) {
        for (const id of identifiers) {
          identifierCounts.set(id, (identifierCounts.get(id) ?? 0) + 1);
        }
      }
    }

    const commonImports: string[] = [];
    for (const [id, count] of identifierCounts) {
      if (count >= 2) {
        commonImports.push(id);
      }
    }
    commonImports.sort();

    results.push({
      moduleId: mod.id,
      hasReexportEntry,
      exportVisibility,
      commonImports,
    });
  }

  return results.sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

// ─── 3. Dependency Direction Analysis ─────────────────────────────────────

export function computeDependencyDirection(
  modules: Module[]
): DependencyDirection {
  // Leaf modules: imported by others but have zero outbound cross-module deps
  const leafModules: string[] = [];
  for (const mod of modules) {
    if (
      mod.imports.internal.length === 0 &&
      mod.imported_by.length > 0
    ) {
      leafModules.push(mod.id);
    }
  }
  leafModules.sort();

  // Hub modules: sorted by inbound count descending, threshold >= 3
  const hubModules: HubModule[] = modules
    .filter((mod) => mod.imported_by.length >= 3)
    .map((mod) => ({
      moduleId: mod.id,
      inboundCount: mod.imported_by.length,
    }))
    .sort((a, b) => b.inboundCount - a.inboundCount);

  // Circular dependencies: Tarjan's SCC
  const circularDependencies = detectCycles(modules);

  return { leafModules, hubModules, circularDependencies };
}

/**
 * Detect cycles using Tarjan's strongly connected components algorithm.
 * Returns arrays of module ID chains representing cycles (SCCs of size > 1).
 */
function detectCycles(modules: Module[]): string[][] {
  const moduleIds = new Set(modules.map((m) => m.id));

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const mod of modules) {
    adj.set(
      mod.id,
      mod.imports.internal
        .map((imp) => imp.module_id)
        .filter((id) => moduleIds.has(id))
    );
  }

  // Tarjan's algorithm
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      // Only report SCCs of size > 1 (actual cycles)
      if (scc.length > 1) {
        sccs.push(scc.sort());
      }
    }
  }

  for (const mod of modules) {
    if (!indices.has(mod.id)) {
      strongconnect(mod.id);
    }
  }

  return sccs.sort((a, b) => a[0].localeCompare(b[0]));
}

// ─── 4. Linter/Formatter Config Detection ─────────────────────────────────

interface ToolDetectionEntry {
  name: string;
  patterns: string[];
}

const TOOL_DETECTION: Record<string, ToolDetectionEntry[]> = {
  typescript: [
    { name: "eslint", patterns: [".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"] },
    { name: "prettier", patterns: [".prettierrc", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml", ".prettierrc.toml", "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs"] },
    { name: "biome", patterns: ["biome.json", "biome.jsonc"] },
    { name: "dprint", patterns: ["dprint.json", ".dprint.json"] },
    { name: "editorconfig", patterns: [".editorconfig"] },
  ],
  javascript: [
    { name: "eslint", patterns: [".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"] },
    { name: "prettier", patterns: [".prettierrc", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml", ".prettierrc.toml", "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs"] },
    { name: "biome", patterns: ["biome.json", "biome.jsonc"] },
    { name: "dprint", patterns: ["dprint.json", ".dprint.json"] },
    { name: "editorconfig", patterns: [".editorconfig"] },
  ],
  python: [
    { name: "ruff", patterns: ["ruff.toml", ".ruff.toml"] },
    { name: "black", patterns: ["black.toml", ".black.toml"] },
    { name: "flake8", patterns: [".flake8"] },
    { name: "pylint", patterns: [".pylintrc", "pylintrc"] },
    { name: "mypy", patterns: ["mypy.ini", ".mypy.ini"] },
    { name: "isort", patterns: [".isort.cfg"] },
    { name: "pydocstyle", patterns: [".pydocstyle"] },
    { name: "bandit", patterns: [".bandit"] },
    { name: "pyproject", patterns: ["pyproject.toml"] },
  ],
  rust: [
    { name: "clippy", patterns: ["clippy.toml", ".clippy.toml"] },
    { name: "rustfmt", patterns: ["rustfmt.toml", ".rustfmt.toml"] },
  ],
  go: [
    { name: "golangci-lint", patterns: [".golangci.yml", ".golangci.yaml", ".golangci.json", ".golangci.toml"] },
  ],
  ruby: [
    { name: "rubocop", patterns: [".rubocop.yml", ".rubocop_todo.yml"] },
    { name: "standard", patterns: [".standard.yml"] },
  ],
  java: [
    { name: "checkstyle", patterns: ["checkstyle.xml"] },
    { name: "editorconfig", patterns: [".editorconfig"] },
  ],
  kotlin: [
    { name: "detekt", patterns: ["detekt.yml", "detekt.yaml", "detekt-config.yml"] },
    { name: "ktlint", patterns: [".ktlint", ".editorconfig"] },
  ],
  c: [
    { name: "clang-format", patterns: [".clang-format"] },
    { name: "clang-tidy", patterns: [".clang-tidy"] },
    { name: "cppcheck", patterns: [".cppcheck"] },
  ],
  cpp: [
    { name: "clang-format", patterns: [".clang-format"] },
    { name: "clang-tidy", patterns: [".clang-tidy"] },
    { name: "cppcheck", patterns: [".cppcheck"] },
  ],
  php: [
    { name: "php-cs-fixer", patterns: [".php-cs-fixer.php", ".php-cs-fixer.dist.php"] },
    { name: "phpcs", patterns: [".phpcs.xml", "phpcs.xml", ".phpcs.xml.dist", "phpcs.xml.dist"] },
    { name: "phpstan", patterns: ["phpstan.neon", "phpstan.neon.dist"] },
    { name: "psalm", patterns: ["psalm.xml", "psalm.xml.dist"] },
  ],
  swift: [
    { name: "swiftlint", patterns: [".swiftlint.yml", ".swiftlint.yaml"] },
    { name: "swiftformat", patterns: [".swiftformat"] },
  ],
  csharp: [
    { name: "editorconfig", patterns: [".editorconfig"] },
    { name: "stylecop", patterns: ["stylecop.json", "StyleCop.Analyzers.ruleset"] },
    { name: "globalconfig", patterns: [".globalconfig"] },
  ],
};

export async function computeLinterFormatterConfig(
  projectPath: string,
  profile: ProjectProfile
): Promise<LinterFormatterConfig> {
  const detectedTools: DetectedTool[] = [];
  const seenTools = new Set<string>();

  // Determine which language tool sets to check
  const languageNames = profile.languages.map((l) => l.name.toLowerCase());

  for (const lang of languageNames) {
    const entries = TOOL_DETECTION[lang];
    if (!entries) continue;

    for (const entry of entries) {
      // Skip if we already detected this tool (e.g., eslint via typescript AND javascript)
      if (seenTools.has(entry.name)) continue;

      for (const pattern of entry.patterns) {
        const fullPath = path.join(projectPath, pattern);
        if (await fs.pathExists(fullPath)) {
          detectedTools.push({
            name: entry.name,
            configFile: pattern,
          });
          seenTools.add(entry.name);
          break; // Found this tool, move to next
        }
      }
    }
  }

  return {
    tools: detectedTools.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ─── Top-level computation ────────────────────────────────────────────────

export async function computeConsistencyReport(
  projectPath: string,
  modules: Module[],
  profile: ProjectProfile,
  fileImportMap: FileImportMap
): Promise<ConsistencyReport> {
  const namingPatterns = computeNamingPatterns(modules);
  const moduleInterfaces = computeModuleInterfacePatterns(modules, fileImportMap);
  const dependencyDirection = computeDependencyDirection(modules);
  const linterFormatterConfig = await computeLinterFormatterConfig(
    projectPath,
    profile
  );

  return {
    namingPatterns,
    moduleInterfaces,
    dependencyDirection,
    linterFormatterConfig,
  };
}
