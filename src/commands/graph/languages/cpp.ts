/**
 * C++ language extractor.
 *
 * Handles .cpp, .hpp, .cc, .hh files. Extends C's #include model with
 * namespace_definition, class_specifier, and additional declaration types.
 * Uses the C++ tree-sitter grammar.
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

// ─── Export Extraction ─────────────────────────────────────────────────────

function collectExports(node: SyntaxNode, exports: ExportedSymbol[]): void {
  for (const child of node.children) {
    switch (child.type) {
      case "function_definition": {
        const declarator = findChild(child, "function_declarator");
        if (declarator) {
          const id = findChild(declarator, "identifier") ??
                     findChild(declarator, "field_identifier");
          if (id) exports.push({ name: id.text.trim(), type: "function" });
        }
        break;
      }
      case "declaration": {
        const funcDecl = findChild(child, "function_declarator");
        if (funcDecl) {
          const id = findChild(funcDecl, "identifier");
          if (id) exports.push({ name: id.text.trim(), type: "function" });
        }
        break;
      }
      case "class_specifier": {
        const id = findChild(child, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "class" });
        break;
      }
      case "struct_specifier": {
        const id = findChild(child, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "class" });
        break;
      }
      case "enum_specifier": {
        const id = findChild(child, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "enum" });
        break;
      }
      case "type_definition": {
        const id = findChild(child, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "type" });
        break;
      }
      case "preproc_def": {
        const id = findChild(child, "identifier");
        if (id) exports.push({ name: id.text.trim(), type: "constant" });
        break;
      }
      case "namespace_definition": {
        // Recurse into namespace declaration_list
        const declList = findChild(child, "declaration_list");
        if (declList) collectExports(declList, exports);
        break;
      }
    }
  }
}

function extractExportsCpp(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  collectExports(tree.rootNode, exports);
  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsCpp(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "preproc_include") continue;

    const systemLib = findChild(node, "system_lib_string");
    const stringLit = findChild(node, "string_literal");

    if (systemLib) {
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

function resolveImportPathCpp(
  specifier: string,
  fromFile: string,
  allFileSet: Set<string>
): string | null {
  if (specifier.startsWith("/")) return null;

  const fromDir = path.dirname(fromFile);
  const resolved = path.join(fromDir, specifier).replace(/\\/g, "/");

  if (allFileSet.has(resolved)) return resolved;
  if (allFileSet.has(specifier)) return specifier;

  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportCpp(specifier: string): boolean {
  return !specifier.startsWith("./") && !specifier.startsWith("../");
}

function extractPackageNameCpp(specifier: string): string {
  const parts = specifier.replace(/\.(h|hpp|hh)$/, "").split("/");
  return parts[0];
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const cppExtractor: LanguageExtractor = {
  grammarNames: ["cpp"],
  extensions: [".cpp", ".hpp", ".cc", ".hh"],
  extractExports: extractExportsCpp,
  extractImports: extractImportsCpp,
  isExternalImport: isExternalImportCpp,
  extractPackageName: extractPackageNameCpp,
  resolveImportPath: resolveImportPathCpp,
};
