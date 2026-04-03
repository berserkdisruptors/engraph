/**
 * Ruby language extractor.
 *
 * Handles .rb files. Ruby has no formal export system — all top-level
 * methods, classes, and modules are public by default. Imports use
 * require and require_relative as function calls.
 */

import path from "path";
import type { ExportedSymbol, SymbolKind } from "../types.js";
import type { LanguageExtractor, RawImport, Tree, SyntaxNode } from "./types.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function findChild(node: SyntaxNode, type: string): SyntaxNode | null {
  for (const child of node.children) {
    if (child.type === type) return child;
  }
  return null;
}

function stripQuotes(s: string): string {
  return s.replace(/^['"]|['"]$/g, "");
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsRuby(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    switch (node.type) {
      case "method": {
        const id = findChild(node, "identifier");
        if (id) exports.push({ name: id.text.trim(), type: "function" });
        break;
      }
      case "class": {
        const id = findChild(node, "constant");
        if (id) exports.push({ name: id.text.trim(), type: "class" });
        break;
      }
      case "module": {
        const id = findChild(node, "constant");
        if (id) exports.push({ name: id.text.trim(), type: "class" });
        break;
      }
      case "assignment": {
        const id = findChild(node, "constant");
        if (id) exports.push({ name: id.text.trim(), type: "constant" });
        break;
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsRuby(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "call") continue;

    const methodName = findChild(node, "identifier");
    if (!methodName) continue;

    const name = methodName.text.trim();
    if (name !== "require" && name !== "require_relative") continue;

    const args = findChild(node, "argument_list");
    if (!args) continue;

    // Get the first string argument
    const stringNode = findChild(args, "string") ?? findChild(args, "string_literal");
    if (!stringNode) continue;

    // Extract content from string node
    let specifier = "";
    const content = findChild(stringNode, "string_content");
    if (content) {
      specifier = content.text.trim();
    } else {
      specifier = stripQuotes(stringNode.text.trim());
    }

    if (!specifier) continue;

    imports.push({
      specifier,
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

function resolveImportPathRuby(
  specifier: string,
  fromFile: string,
  allFileSet: Set<string>
): string | null {
  // Only resolve relative paths (require_relative)
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;

  const fromDir = path.dirname(fromFile);
  const resolved = path.join(fromDir, specifier).replace(/\\/g, "/");

  // Try with .rb extension
  const rbFile = resolved.endsWith(".rb") ? resolved : resolved + ".rb";
  if (allFileSet.has(rbFile)) return rbFile;

  // Try exact match
  if (allFileSet.has(resolved)) return resolved;

  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportRuby(specifier: string): boolean {
  // require_relative always produces relative paths (./  ../)
  // require with a bare name is external (gem)
  return !specifier.startsWith("./") && !specifier.startsWith("../");
}

function extractPackageNameRuby(specifier: string): string {
  // gem name: first path segment
  // json → json, active_support/core_ext → active_support
  return specifier.split("/")[0];
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const rubyExtractor: LanguageExtractor = {
  grammarNames: ["ruby"],
  extensions: [".rb"],
  extractExports: extractExportsRuby,
  extractImports: extractImportsRuby,
  isExternalImport: isExternalImportRuby,
  extractPackageName: extractPackageNameRuby,
  resolveImportPath: resolveImportPathRuby,
};
