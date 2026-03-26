/**
 * PHP language extractor.
 *
 * Handles .php files. PHP exports are top-level functions, classes,
 * interfaces, enums, and traits. Imports use namespace_use_declaration
 * (the `use` statement).
 */

import type { ExportedSymbol, SymbolKind } from "../types.js";
import type { LanguageExtractor, RawImport, RawImportedSymbol, Tree, SyntaxNode } from "./types.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function findChild(node: SyntaxNode, type: string): SyntaxNode | null {
  for (const child of node.children) {
    if (child.type === type) return child;
  }
  return null;
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsPhp(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  // PHP AST has a "program" root; declarations are direct children
  for (const node of root.children) {
    switch (node.type) {
      case "function_definition": {
        const id = findChild(node, "name");
        if (id) exports.push({ name: id.text.trim(), type: "function" });
        break;
      }
      case "class_declaration": {
        const id = findChild(node, "name");
        if (id) exports.push({ name: id.text.trim(), type: "class" });
        break;
      }
      case "interface_declaration": {
        const id = findChild(node, "name");
        if (id) exports.push({ name: id.text.trim(), type: "interface" });
        break;
      }
      case "trait_declaration": {
        const id = findChild(node, "name");
        if (id) exports.push({ name: id.text.trim(), type: "class" });
        break;
      }
      case "enum_declaration": {
        const id = findChild(node, "name");
        if (id) exports.push({ name: id.text.trim(), type: "enum" });
        break;
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsPhp(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "namespace_use_declaration") continue;

    // Extract namespace path from use clause
    const useClause = findChild(node, "namespace_use_clause");
    if (!useClause) continue;

    const qualifiedName = findChild(useClause, "qualified_name");
    if (!qualifiedName) continue;

    const fullPath = qualifiedName.text.trim();

    // Split into namespace and symbol
    const lastSlash = fullPath.lastIndexOf("\\");
    if (lastSlash >= 0) {
      const ns = fullPath.slice(0, lastSlash);
      const symbolName = fullPath.slice(lastSlash + 1);
      imports.push({
        specifier: ns,
        symbols: [{ name: symbolName, isTypeOnly: false }],
        isTypeOnly: false,
        isReExport: false,
        isDefault: false,
        isNamespace: false,
      });
    } else {
      imports.push({
        specifier: fullPath,
        symbols: [],
        isTypeOnly: false,
        isReExport: false,
        isDefault: false,
        isNamespace: true,
      });
    }
  }

  return imports;
}

// ─── Resolution ────────────────────────────────────────────────────────────

function resolveImportPathPhp(
  _specifier: string,
  _fromFile: string,
  _allFileSet: Set<string>
): string | null {
  // PHP namespace-based imports require composer.json autoload config
  // to map namespaces to directories. Not feasible without that.
  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportPhp(_specifier: string): boolean {
  // Without composer.json autoload mapping, all use statements
  // are treated as external
  return true;
}

function extractPackageNamePhp(specifier: string): string {
  // Top-level vendor namespace: App\Core → App
  // Vendor\Package → Vendor
  return specifier.split("\\")[0];
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const phpExtractor: LanguageExtractor = {
  grammarNames: ["php"],
  extensions: [".php"],
  extractExports: extractExportsPhp,
  extractImports: extractImportsPhp,
  isExternalImport: isExternalImportPhp,
  extractPackageName: extractPackageNamePhp,
  resolveImportPath: resolveImportPathPhp,
};
