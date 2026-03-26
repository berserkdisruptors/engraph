/**
 * C language extractor.
 *
 * Handles .c and .h files. C has no formal export system — header file
 * declarations are the public API. #include directives serve as imports.
 * Quoted includes are internal, angle-bracket includes are external.
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
  return s.replace(/^["']|["']$/g, "");
}

function isStatic(node: SyntaxNode): boolean {
  return node.children.some(
    (c) => c.type === "storage_class_specifier" && c.text === "static"
  );
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsC(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    switch (node.type) {
      case "function_definition": {
        if (isStatic(node)) break;
        const declarator = findChild(node, "function_declarator");
        if (declarator) {
          const id = findChild(declarator, "identifier");
          if (id) exports.push({ name: id.text.trim(), type: "function" });
        }
        break;
      }
      case "declaration": {
        if (isStatic(node)) break;
        const funcDecl = findChild(node, "function_declarator");
        if (funcDecl) {
          const id = findChild(funcDecl, "identifier");
          if (id) exports.push({ name: id.text.trim(), type: "function" });
        }
        break;
      }
      case "type_definition": {
        const id = findChild(node, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "type" });
        break;
      }
      case "enum_specifier": {
        const id = findChild(node, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "enum" });
        break;
      }
      case "struct_specifier": {
        const id = findChild(node, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "class" });
        break;
      }
      case "preproc_def": {
        const id = findChild(node, "identifier");
        if (id) exports.push({ name: id.text.trim(), type: "constant" });
        break;
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsC(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "preproc_include") continue;

    const systemLib = findChild(node, "system_lib_string");
    const stringLit = findChild(node, "string_literal");

    if (systemLib) {
      // #include <stdio.h> — external
      const name = systemLib.text.replace(/^<|>$/g, "");
      imports.push({
        specifier: name,
        symbols: [],
        isTypeOnly: false,
        isReExport: false,
        isDefault: false,
        isNamespace: true,
      });
    } else if (stringLit) {
      // #include "myheader.h" — potentially internal
      const name = stripQuotes(stringLit.text);
      imports.push({
        specifier: name,
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

function resolveImportPathC(
  specifier: string,
  fromFile: string,
  allFileSet: Set<string>
): string | null {
  // Only resolve quoted includes (relative paths)
  if (specifier.startsWith("/")) return null;

  const fromDir = path.dirname(fromFile);
  const resolved = path.join(fromDir, specifier).replace(/\\/g, "/");

  if (allFileSet.has(resolved)) return resolved;

  // Try from project root
  if (allFileSet.has(specifier)) return specifier;

  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportC(specifier: string): boolean {
  // Angle-bracket includes are external, quoted includes starting with
  // relative paths are internal. Bare quoted includes are ambiguous —
  // treat as internal if they can be resolved, external otherwise.
  // This is a heuristic since C has no formal package system.
  return !specifier.startsWith("./") && !specifier.startsWith("../");
}

function extractPackageNameC(specifier: string): string {
  // For system headers: stdio.h → stdio, sys/types.h → sys
  const parts = specifier.replace(/\.h$/, "").split("/");
  return parts[0];
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const cExtractor: LanguageExtractor = {
  grammarNames: ["c"],
  extensions: [".c", ".h"],
  extractExports: extractExportsC,
  extractImports: extractImportsC,
  isExternalImport: isExternalImportC,
  extractPackageName: extractPackageNameC,
  resolveImportPath: resolveImportPathC,
};
