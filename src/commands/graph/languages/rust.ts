/**
 * Rust language extractor.
 *
 * Handles .rs files. Rust exports are determined by the `pub` visibility
 * modifier. Imports use `use` declarations with path syntax
 * (crate::, super::, self:: for internal, everything else external).
 */

import path from "path";
import type { ExportedSymbol, SymbolKind } from "../types.js";
import type { LanguageExtractor, RawImport, RawImportedSymbol, Tree, SyntaxNode } from "./types.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function findChild(node: SyntaxNode, type: string): SyntaxNode | null {
  for (const child of node.children) {
    if (child.type === type) return child;
  }
  return null;
}

function hasPubModifier(node: SyntaxNode): boolean {
  return node.children.some(
    (c) => c.type === "visibility_modifier" && c.text.startsWith("pub")
  );
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsRust(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (!hasPubModifier(node)) continue;

    let name: string | null = null;
    let kind: SymbolKind = "function";

    switch (node.type) {
      case "function_item": {
        const id = findChild(node, "identifier");
        if (id) { name = id.text.trim(); kind = "function"; }
        break;
      }
      case "struct_item": {
        const id = findChild(node, "type_identifier");
        if (id) { name = id.text.trim(); kind = "class"; }
        break;
      }
      case "trait_item": {
        const id = findChild(node, "type_identifier");
        if (id) { name = id.text.trim(); kind = "interface"; }
        break;
      }
      case "enum_item": {
        const id = findChild(node, "type_identifier");
        if (id) { name = id.text.trim(); kind = "enum"; }
        break;
      }
      case "type_item": {
        const id = findChild(node, "type_identifier");
        if (id) { name = id.text.trim(); kind = "type"; }
        break;
      }
      case "const_item": {
        const id = findChild(node, "identifier");
        if (id) { name = id.text.trim(); kind = "constant"; }
        break;
      }
      case "static_item": {
        const id = findChild(node, "identifier");
        if (id) { name = id.text.trim(); kind = "constant"; }
        break;
      }
    }

    if (name) {
      exports.push({ name, type: kind });
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractUseTree(node: SyntaxNode): { specifier: string; symbols: RawImportedSymbol[] } | null {
  // Extract the full path from use_declaration
  // use crate::utils::{helper, Config};
  // use std::collections::HashMap;
  const text = node.text.trim();
  // Remove "use " prefix and ";" suffix and pub modifier
  let usePath = text
    .replace(/^pub\s+/, "")
    .replace(/^use\s+/, "")
    .replace(/;$/, "")
    .trim();

  // Handle grouped imports: use crate::utils::{A, B};
  const braceMatch = usePath.match(/^(.+)::\{(.+)\}$/);
  if (braceMatch) {
    const basePath = braceMatch[1];
    const names = braceMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
    const symbols: RawImportedSymbol[] = names.map((n) => ({
      name: n,
      isTypeOnly: false,
    }));
    return { specifier: basePath, symbols };
  }

  // Handle glob imports: use crate::utils::*;
  if (usePath.endsWith("::*")) {
    return {
      specifier: usePath.slice(0, -3),
      symbols: [],
    };
  }

  // Simple import: use std::collections::HashMap;
  const lastSep = usePath.lastIndexOf("::");
  if (lastSep >= 0) {
    const basePath = usePath.slice(0, lastSep);
    const name = usePath.slice(lastSep + 2);
    return {
      specifier: basePath,
      symbols: [{ name, isTypeOnly: false }],
    };
  }

  // Single-segment use (rare): use something;
  return {
    specifier: usePath,
    symbols: [],
  };
}

function extractImportsRust(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "use_declaration") continue;

    const result = extractUseTree(node);
    if (!result) continue;

    imports.push({
      specifier: result.specifier,
      symbols: result.symbols,
      isTypeOnly: false,
      isReExport: false,
      isDefault: false,
      isNamespace: result.symbols.length === 0,
    });
  }

  return imports;
}

// ─── Resolution ────────────────────────────────────────────────────────────

function resolveImportPathRust(
  specifier: string,
  fromFile: string,
  allFileSet: Set<string>
): string | null {
  // Only resolve crate::, super::, self:: paths
  if (!specifier.startsWith("crate::") &&
      !specifier.startsWith("super::") &&
      !specifier.startsWith("self::")) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  let segments: string[];

  if (specifier.startsWith("crate::")) {
    // crate:: resolves from the crate root (src/)
    // Find the src/ root by looking for lib.rs or main.rs
    segments = specifier.slice("crate::".length).split("::");
    // Try resolving from common Rust source roots
    const roots = ["src", ""];
    for (const root of roots) {
      const basePath = root ? root + "/" : "";
      const modulePath = basePath + segments.join("/");
      const candidates = [
        modulePath + ".rs",
        modulePath + "/mod.rs",
      ];
      for (const candidate of candidates) {
        if (allFileSet.has(candidate)) return candidate;
      }
    }
  } else if (specifier.startsWith("super::")) {
    segments = specifier.slice("super::".length).split("::");
    const parentDir = path.dirname(fromDir);
    const modulePath = path.join(parentDir, ...segments).replace(/\\/g, "/");
    const candidates = [modulePath + ".rs", modulePath + "/mod.rs"];
    for (const candidate of candidates) {
      if (allFileSet.has(candidate)) return candidate;
    }
  } else if (specifier.startsWith("self::")) {
    segments = specifier.slice("self::".length).split("::");
    const modulePath = path.join(fromDir, ...segments).replace(/\\/g, "/");
    const candidates = [modulePath + ".rs", modulePath + "/mod.rs"];
    for (const candidate of candidates) {
      if (allFileSet.has(candidate)) return candidate;
    }
  }

  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportRust(specifier: string): boolean {
  return !specifier.startsWith("crate::") &&
         !specifier.startsWith("super::") &&
         !specifier.startsWith("self::");
}

function extractPackageNameRust(specifier: string): string {
  // First segment of the path is the crate name
  // std::collections → std
  // tokio::runtime → tokio
  return specifier.split("::")[0];
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const rustExtractor: LanguageExtractor = {
  grammarNames: ["rust"],
  extensions: [".rs"],
  extractExports: extractExportsRust,
  extractImports: extractImportsRust,
  isExternalImport: isExternalImportRust,
  extractPackageName: extractPackageNameRust,
  resolveImportPath: resolveImportPathRust,
};
