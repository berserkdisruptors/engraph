/**
 * Import analysis orchestrator — the core of WP4.
 *
 * Drives all language extractors through a 4-pass pipeline:
 *  1. Extract exports from every source file
 *  2. Extract imports and resolve them to modules
 *  3. Build reverse index (imported_by)
 *  4. Build dependency graph (edges, core/leaf modules)
 *
 * Uses web-tree-sitter (WASM) for parsing — no native compilation needed.
 * See: https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web
 */

import path from "path";
import { createRequire } from "module";
import fs from "fs-extra";
import Parser from "web-tree-sitter";
import type {
  Module,
  ExportedSymbol,
  ImportedSymbol,
  SymbolKind,
  InternalImport,
  ExternalImport,
  ImportedByEntry,
} from "./types.js";
import { getExtractor } from "./languages/registry.js";
import type { LanguageExtractor, RawImport } from "./languages/types.js";
import type { FileImportMap } from "./consistency.js";

// ─── WASM Parser Management ───────────────────────────────────────────────

let initialized = false;
const loadedLanguages = new Map<string, Parser.Language>();

const require = createRequire(import.meta.url);

async function ensureInit(): Promise<void> {
  if (initialized) return;
  await Parser.init();
  initialized = true;
}

function resolveWasmPath(grammarName: string): string {
  // tree-sitter-wasms ships pre-built .wasm files in out/
  return require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammarName}.wasm`);
}

async function getLanguage(grammarName: string): Promise<Parser.Language> {
  const cached = loadedLanguages.get(grammarName);
  if (cached) return cached;

  const wasmPath = resolveWasmPath(grammarName);
  const language = await Parser.Language.load(wasmPath);
  loadedLanguages.set(grammarName, language);
  return language;
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface AnalyzeImportsOptions {
  debug?: boolean;
}

/**
 * Analyze imports/exports across all modules using tree-sitter WASM.
 *
 * Mutates `modules` in-place (populates file exports, module imports, imported_by).
 * Returns a FileImportMap for consistency report computation (per-file import data).
 */
export async function analyzeImports(
  projectPath: string,
  modules: Module[],
  sourceRoots: string[],
  options: AnalyzeImportsOptions = {}
): Promise<FileImportMap> {
  const { debug = false } = options;

  // Build a set of all file paths for import resolution
  const allFileSet = new Set<string>();
  for (const mod of modules) {
    for (const file of mod.files) {
      allFileSet.add(file.path);
    }
    for (const tf of mod.test_files) {
      allFileSet.add(tf);
    }
  }

  // Build module lookup: file path → module
  const fileToModule = new Map<string, Module>();
  for (const mod of modules) {
    for (const file of mod.files) {
      fileToModule.set(file.path, mod);
    }
    for (const tf of mod.test_files) {
      fileToModule.set(tf, mod);
    }
  }

  // Initialize the WASM parser
  await ensureInit();

  if (debug) {
    console.log(`[analyzer] tree-sitter WASM initialized`);
  }

  // ── Pass 1: Extract exports ──────────────────────────────────────────

  const exportMap = new Map<string, Map<string, SymbolKind>>();
  let parsedFiles = 0;

  for (const mod of modules) {
    for (const file of mod.files) {
      const ext = path.extname(file.path).toLowerCase();
      const extractor = await getExtractor(ext);
      if (!extractor) continue;

      const tree = await parseFile(projectPath, file.path, extractor);
      if (!tree) continue;

      const exports = extractor.extractExports(tree, file.path);
      file.exports = sortExports(exports);
      parsedFiles++;

      // Build export lookup for import resolution
      const symbolMap = new Map<string, SymbolKind>();
      for (const exp of exports) {
        symbolMap.set(exp.name, exp.type);
      }
      exportMap.set(file.path, symbolMap);
    }
  }

  if (debug) {
    console.log(`[analyzer] pass 1: extracted exports from ${parsedFiles} files`);
  }

  // ── Pass 2: Extract imports and resolve ──────────────────────────────

  const moduleInternalImports = new Map<string, Map<string, InternalImportAcc>>();
  const moduleExternalImports = new Map<string, Map<string, ExternalImportAcc>>();

  // Side-channel: per-file import identifiers for consistency report computation
  const fileImportMap: FileImportMap = new Map();

  for (const mod of modules) {
    moduleInternalImports.set(mod.id, new Map());
    moduleExternalImports.set(mod.id, new Map());

    for (const file of mod.files) {
      const ext = path.extname(file.path).toLowerCase();
      const extractor = await getExtractor(ext);
      if (!extractor) continue;

      const tree = await parseFile(projectPath, file.path, extractor);
      if (!tree) continue;

      const rawImports = extractor.extractImports(tree, file.path);

      // Collect per-file imported identifiers for consistency reports
      const fileIdentifiers: string[] = [];
      for (const raw of rawImports) {
        for (const sym of raw.symbols) {
          fileIdentifiers.push(sym.name);
        }
      }
      if (fileIdentifiers.length > 0) {
        if (!fileImportMap.has(mod.id)) {
          fileImportMap.set(mod.id, new Map());
        }
        fileImportMap.get(mod.id)!.set(file.path, fileIdentifiers);
      }

      for (const raw of rawImports) {
        processRawImport(
          raw,
          file.path,
          mod,
          extractor,
          allFileSet,
          sourceRoots,
          exportMap,
          fileToModule,
          moduleInternalImports,
          moduleExternalImports
        );
      }
    }
  }

  // Flatten accumulated imports into module.imports
  for (const mod of modules) {
    const intMap = moduleInternalImports.get(mod.id)!;
    mod.imports.internal = sortInternalImports(
      Array.from(intMap.values()).map(accToInternalImport)
    );

    const extMap = moduleExternalImports.get(mod.id)!;
    mod.imports.external = sortExternalImports(
      Array.from(extMap.values()).map(accToExternalImport)
    );
  }

  if (debug) {
    const totalInternal = modules.reduce(
      (sum, m) => sum + m.imports.internal.length, 0
    );
    const totalExternal = modules.reduce(
      (sum, m) => sum + m.imports.external.length, 0
    );
    console.log(
      `[analyzer] pass 2: ${totalInternal} internal + ${totalExternal} external import relationships`
    );
  }

  // ── Pass 3: Build reverse index (imported_by) ────────────────────────

  const importedByMap = new Map<string, Map<string, ImportedByAcc>>();
  for (const mod of modules) {
    importedByMap.set(mod.id, new Map());
  }

  for (const mod of modules) {
    for (const imp of mod.imports.internal) {
      const targetAcc = importedByMap.get(imp.module_id);
      if (!targetAcc) continue;

      const existing = targetAcc.get(mod.id);
      if (existing) {
        existing.importCount += imp.import_count;
        for (const sym of imp.symbols) {
          if (!existing.symbols.has(sym.name)) {
            existing.symbols.set(sym.name, sym.kind);
          }
        }
      } else {
        const symbols = new Map<string, SymbolKind>();
        for (const sym of imp.symbols) {
          symbols.set(sym.name, sym.kind);
        }
        targetAcc.set(mod.id, {
          moduleId: mod.id,
          importCount: imp.import_count,
          symbols,
        });
      }
    }
  }

  for (const mod of modules) {
    const acc = importedByMap.get(mod.id)!;
    mod.imported_by = sortImportedBy(
      Array.from(acc.values()).map(accToImportedByEntry)
    );
  }

  if (debug) {
    console.log(`[analyzer] pass 3: reverse index built`);
  }

  return fileImportMap;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/** Parse a file using tree-sitter, returns the AST or null on failure */
async function parseFile(
  projectPath: string,
  filePath: string,
  extractor: LanguageExtractor
): Promise<Parser.Tree | null> {
  try {
    const fullPath = path.join(projectPath, filePath);
    const content = await fs.readFile(fullPath, "utf8");

    const parser = new Parser();
    const grammarName = extractor.grammarNames[0];
    const language = await getLanguage(grammarName);
    parser.setLanguage(language);

    return parser.parse(content);
  } catch {
    return null;
  }
}

// ─── Import Accumulation Types ─────────────────────────────────────────────

interface InternalImportAcc {
  moduleId: string;
  importCount: number;
  symbols: Map<string, SymbolKind>;
}

interface ExternalImportAcc {
  package: string;
  importCount: number;
}

interface ImportedByAcc {
  moduleId: string;
  importCount: number;
  symbols: Map<string, SymbolKind>;
}

function accToInternalImport(acc: InternalImportAcc): InternalImport {
  const symbols: ImportedSymbol[] = Array.from(acc.symbols.entries())
    .map(([name, kind]) => ({ name, kind }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    module_id: acc.moduleId,
    import_count: acc.importCount,
    symbols,
  };
}

function accToExternalImport(acc: ExternalImportAcc): ExternalImport {
  return {
    package: acc.package,
    import_count: acc.importCount,
  };
}

function accToImportedByEntry(acc: ImportedByAcc): ImportedByEntry {
  const symbols: ImportedSymbol[] = Array.from(acc.symbols.entries())
    .map(([name, kind]) => ({ name, kind }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    module_id: acc.moduleId,
    import_count: acc.importCount,
    symbols,
  };
}

// ─── Process a single raw import ───────────────────────────────────────────

function processRawImport(
  raw: RawImport,
  fromFile: string,
  fromModule: Module,
  extractor: LanguageExtractor,
  allFileSet: Set<string>,
  _sourceRoots: string[],
  exportMap: Map<string, Map<string, SymbolKind>>,
  fileToModule: Map<string, Module>,
  moduleInternalImports: Map<string, Map<string, InternalImportAcc>>,
  moduleExternalImports: Map<string, Map<string, ExternalImportAcc>>
): void {
  if (extractor.isExternalImport(raw.specifier)) {
    const pkg = extractor.extractPackageName(raw.specifier);
    const extMap = moduleExternalImports.get(fromModule.id)!;
    const existing = extMap.get(pkg);
    if (existing) {
      existing.importCount++;
    } else {
      extMap.set(pkg, { package: pkg, importCount: 1 });
    }
    return;
  }

  // Internal import — resolve the path
  const targetFile = extractor.resolveImportPath(
    raw.specifier, fromFile, allFileSet
  );
  if (!targetFile) return;

  const targetModule = fileToModule.get(targetFile);
  if (!targetModule) return;

  // Don't record self-imports (same module)
  if (targetModule.id === fromModule.id) return;

  // Look up symbol kinds from the export map
  const targetExports = exportMap.get(targetFile) ?? new Map<string, SymbolKind>();

  const intMap = moduleInternalImports.get(fromModule.id)!;
  const existing = intMap.get(targetModule.id);

  if (existing) {
    existing.importCount++;
    for (const sym of raw.symbols) {
      if (!existing.symbols.has(sym.name)) {
        const kind = targetExports.get(sym.name) ?? "function";
        existing.symbols.set(sym.name, kind);
      }
    }
  } else {
    const symbols = new Map<string, SymbolKind>();
    for (const sym of raw.symbols) {
      const kind = targetExports.get(sym.name) ?? "function";
      symbols.set(sym.name, kind);
    }
    intMap.set(targetModule.id, {
      moduleId: targetModule.id,
      importCount: 1,
      symbols,
    });
  }
}

// ─── Sorting helpers (deterministic output) ────────────────────────────────

function sortExports(exports: ExportedSymbol[]): ExportedSymbol[] {
  return [...exports].sort((a, b) => a.name.localeCompare(b.name));
}

function sortInternalImports(imports: InternalImport[]): InternalImport[] {
  return [...imports].sort((a, b) => a.module_id.localeCompare(b.module_id));
}

function sortExternalImports(imports: ExternalImport[]): ExternalImport[] {
  return [...imports].sort((a, b) => a.package.localeCompare(b.package));
}

function sortImportedBy(entries: ImportedByEntry[]): ImportedByEntry[] {
  return [...entries].sort((a, b) => a.module_id.localeCompare(b.module_id));
}

/** Reset parser state (for testing) */
export function resetParserState(): void {
  initialized = false;
  loadedLanguages.clear();
}
