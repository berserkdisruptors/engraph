/**
 * Swift language extractor.
 *
 * Handles .swift files. Swift exports are determined by access modifiers —
 * public and open are exported, internal/private/fileprivate are not.
 * Imports use import_declaration with a module identifier.
 */

import type { ExportedSymbol, SymbolKind } from "../types.js";
import type { LanguageExtractor, RawImport, Tree, SyntaxNode } from "./types.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function findChild(node: SyntaxNode, type: string): SyntaxNode | null {
  for (const child of node.children) {
    if (child.type === type) return child;
  }
  return null;
}

function hasPublicAccess(node: SyntaxNode): boolean {
  const modifiers = findChild(node, "modifiers");
  if (!modifiers) return false;
  const text = modifiers.text.trim();
  return text.includes("public") || text.includes("open");
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsSwift(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (!hasPublicAccess(node)) continue;

    switch (node.type) {
      case "function_declaration": {
        const id = findChild(node, "simple_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "function" });
        break;
      }
      case "class_declaration": {
        const id = findChild(node, "type_identifier");
        if (!id) break;
        const name = id.text.trim();

        // Swift uses class_declaration for enum too (with "enum" keyword child)
        const isEnum = node.children.some((c) => c.type === "enum");
        if (isEnum) {
          exports.push({ name, type: "enum" });
        } else {
          exports.push({ name, type: "class" });
        }
        break;
      }
      case "protocol_declaration": {
        const id = findChild(node, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "interface" });
        break;
      }
      case "typealias_declaration": {
        const id = findChild(node, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "type" });
        break;
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsSwift(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "import_declaration") continue;

    const id = findChild(node, "identifier");
    if (!id) continue;

    imports.push({
      specifier: id.text.trim(),
      symbols: [],
      isTypeOnly: false,
      isReExport: false,
      isDefault: false,
      isNamespace: true,
    });
  }

  return imports;
}

// ─── Resolution ────────────────────────────────────────────────────────────

function resolveImportPathSwift(
  _specifier: string,
  _fromFile: string,
  _allFileSet: Set<string>
): string | null {
  // Swift imports modules by name, not file paths.
  // Would need Swift Package Manager manifest to resolve module → source mapping.
  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportSwift(_specifier: string): boolean {
  // Without SPM manifest, all imports are treated as external
  return true;
}

function extractPackageNameSwift(specifier: string): string {
  return specifier;
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const swiftExtractor: LanguageExtractor = {
  grammarNames: ["swift"],
  extensions: [".swift"],
  extractExports: extractExportsSwift,
  extractImports: extractImportsSwift,
  isExternalImport: isExternalImportSwift,
  extractPackageName: extractPackageNameSwift,
  resolveImportPath: resolveImportPathSwift,
};
