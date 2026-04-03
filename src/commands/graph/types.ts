/**
 * Types for the codegraph — a deterministic, auto-generated structural
 * representation of a codebase.
 *
 * The codegraph is produced by scanning the codebase using static analysis
 * (tree-sitter WASM grammars), requires no LLM calls, and provides the
 * structural backbone that the context graph annotates with understanding.
 */

// ─── Section 1: Project Profile ─────────────────────────────────────────────

export interface LanguageEntry {
  name: string;
  percentage: number;
}

export interface FrameworkEntry {
  name: string;
  type: string;
  detected_in: string;
}

export interface ScaleMetrics {
  total_files: number;
  source_files: number;
  test_files: number;
  total_loc: number;
  source_loc: number;
  test_loc: number;
}

export interface EntryPoint {
  path: string;
  type: string;
}

export type ProjectType =
  | "cli"
  | "web-api"
  | "library"
  | "monorepo"
  | "full-stack"
  | "unknown";

export interface ProjectProfile {
  type: ProjectType;
  languages: LanguageEntry[];
  frameworks: FrameworkEntry[];
  package_manager: string | null;
  entry_points: EntryPoint[];
  test_framework: string | null;
  scale: ScaleMetrics;
}

// ─── Section 2: Module Tree ─────────────────────────────────────────────────

export type ModuleType = "feature" | "utility" | "core" | "entry" | "test";

export type SymbolKind =
  | "function"
  | "class"
  | "type"
  | "interface"
  | "constant"
  | "enum";

export interface ExportedSymbol {
  name: string;
  type: SymbolKind;
  signature?: string;
}

export interface ImportedSymbol {
  name: string;
  kind: SymbolKind;
}

export interface InternalImport {
  module_id: string;
  import_count: number;
  symbols: ImportedSymbol[];
}

export interface ExternalImport {
  package: string;
  import_count: number;
}

export interface ModuleImports {
  internal: InternalImport[];
  external: ExternalImport[];
}

export interface ImportedByEntry {
  module_id: string;
  import_count: number;
  symbols: ImportedSymbol[];
}

export interface FileEntry {
  path: string;
  exports: ExportedSymbol[];
}

export interface Module {
  id: string;
  path: string;
  type: ModuleType;
  files: FileEntry[];
  imports: ModuleImports;
  imported_by: ImportedByEntry[];
  test_files: string[];
}

// ─── Top-level Codegraph ────────────────────────────────────────────────────

export interface Codegraph {
  generated_at: string;
  generator_version: string;
  commit_sha: string | null;

  project: ProjectProfile;
  modules: Module[];
}
