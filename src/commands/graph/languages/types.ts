/**
 * Language extractor interface and shared types for the codegraph import analysis.
 *
 * Each supported language implements LanguageExtractor. The orchestrator (analyzer.ts)
 * drives all extractors through a uniform pipeline: extract exports → extract imports →
 * resolve paths → build dependency graph.
 */

import type { ExportedSymbol } from "../types.js";
import type Parser from "web-tree-sitter";

// Re-export namespaced types for convenience
export type SyntaxNode = Parser.SyntaxNode;
export type Tree = Parser.Tree;

// ─── Raw Import Types ──────────────────────────────────────────────────────

/** Raw import extracted from a single file — before resolution */
export interface RawImport {
  specifier: string;
  symbols: RawImportedSymbol[];
  isTypeOnly: boolean;
  isReExport: boolean;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface RawImportedSymbol {
  name: string;
  isTypeOnly: boolean;
}

// ─── Language Extractor Interface ──────────────────────────────────────────

export interface LanguageExtractor {
  /** tree-sitter grammar name(s) used by this language */
  grammarNames: string[];

  /** File extensions this extractor handles */
  extensions: string[];

  /** Extract exported symbols from a parsed AST */
  extractExports(tree: Tree, filePath: string): ExportedSymbol[];

  /** Extract raw imports from a parsed AST */
  extractImports(tree: Tree, filePath: string): RawImport[];

  /** Determine if an import specifier is external (npm pkg, stdlib, etc.) */
  isExternalImport(specifier: string): boolean;

  /** Extract the package/module name from an external specifier */
  extractPackageName(specifier: string): string;

  /**
   * Resolve a relative/internal import specifier to a file path.
   * Returns null if unresolvable. The orchestrator handles module ID mapping.
   */
  resolveImportPath(
    specifier: string,
    fromFile: string,
    allFileSet: Set<string>
  ): string | null;
}
