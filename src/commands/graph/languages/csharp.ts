/**
 * C# language extractor.
 *
 * Handles .cs files. C# exports are determined by the `public` modifier.
 * Imports use `using` directives. Declarations may be nested inside
 * namespace_declaration > declaration_list.
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

function hasModifier(node: SyntaxNode, modifier: string): boolean {
  return node.children.some(
    (c) => c.type === "modifier" && c.text === modifier
  );
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsFromNode(node: SyntaxNode, exports: ExportedSymbol[]): void {
  if (!hasModifier(node, "public")) return;

  switch (node.type) {
    case "class_declaration": {
      const id = findChild(node, "identifier");
      if (id) exports.push({ name: id.text.trim(), type: "class" });
      // Check for public methods inside
      const body = findChild(node, "declaration_list");
      if (body) {
        for (const member of body.children) {
          if (member.type === "method_declaration" && hasModifier(member, "public")) {
            const methodId = findChild(member, "identifier");
            if (methodId) exports.push({ name: methodId.text.trim(), type: "function" });
          }
          if (member.type === "field_declaration" && hasModifier(member, "public")) {
            const isConst = member.children.some((c) => c.text === "const");
            if (isConst) {
              const declarator = findChild(member, "variable_declaration");
              if (declarator) {
                const varDeclarator = findChild(declarator, "variable_declarator");
                if (varDeclarator) {
                  const fieldId = findChild(varDeclarator, "identifier");
                  if (fieldId) exports.push({ name: fieldId.text.trim(), type: "constant" });
                }
              }
            }
          }
        }
      }
      break;
    }
    case "interface_declaration": {
      const id = findChild(node, "identifier");
      if (id) exports.push({ name: id.text.trim(), type: "interface" });
      break;
    }
    case "enum_declaration": {
      const id = findChild(node, "identifier");
      if (id) exports.push({ name: id.text.trim(), type: "enum" });
      break;
    }
    case "struct_declaration": {
      const id = findChild(node, "identifier");
      if (id) exports.push({ name: id.text.trim(), type: "class" });
      break;
    }
  }
}

function extractExportsCSharp(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    // Top-level declarations (C# 10+ file-scoped namespaces)
    extractExportsFromNode(node, exports);

    // Declarations inside namespace { ... }
    if (node.type === "namespace_declaration") {
      const declList = findChild(node, "declaration_list");
      if (declList) {
        for (const decl of declList.children) {
          extractExportsFromNode(decl, exports);
        }
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsCSharp(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "using_directive") continue;

    // Extract the namespace from using directive
    // using System; → "System"
    // using System.Collections.Generic; → "System.Collections.Generic"
    let namespace = "";

    const qualifiedName = findChild(node, "qualified_name");
    if (qualifiedName) {
      namespace = qualifiedName.text.trim();
    } else {
      const identifier = findChild(node, "identifier");
      if (identifier) {
        namespace = identifier.text.trim();
      }
    }

    if (!namespace) continue;

    imports.push({
      specifier: namespace,
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

function resolveImportPathCSharp(
  _specifier: string,
  _fromFile: string,
  _allFileSet: Set<string>
): string | null {
  // C# uses namespace-based imports that don't directly map to file paths.
  // Would need .csproj analysis to determine project namespace roots.
  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportCSharp(specifier: string): boolean {
  // Without .csproj analysis, all using directives are treated as external.
  // System.*, Microsoft.* are always external.
  return true;
}

function extractPackageNameCSharp(specifier: string): string {
  // Top-level namespace: System.Collections.Generic → System
  // MyApp.Core → MyApp
  return specifier.split(".")[0];
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const csharpExtractor: LanguageExtractor = {
  grammarNames: ["c_sharp"],
  extensions: [".cs"],
  extractExports: extractExportsCSharp,
  extractImports: extractImportsCSharp,
  isExternalImport: isExternalImportCSharp,
  extractPackageName: extractPackageNameCSharp,
  resolveImportPath: resolveImportPathCSharp,
};
