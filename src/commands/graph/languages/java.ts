/**
 * Java language extractor.
 *
 * Handles .java files. Java exports are determined by the `public` access
 * modifier. Imports use import_declaration nodes with scoped identifiers.
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

function findChildren(node: SyntaxNode, type: string): SyntaxNode[] {
  return node.children.filter((c) => c.type === type);
}

function hasModifier(node: SyntaxNode, modifier: string): boolean {
  const modifiers = findChild(node, "modifiers");
  if (!modifiers) return false;
  return modifiers.children.some((c) => c.text === modifier);
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsFromNode(node: SyntaxNode, exports: ExportedSymbol[]): void {
  switch (node.type) {
    case "class_declaration": {
      if (!hasModifier(node, "public")) break;
      const id = findChild(node, "identifier");
      if (id) exports.push({ name: id.text.trim(), type: "class" });
      break;
    }
    case "interface_declaration": {
      if (!hasModifier(node, "public")) break;
      const id = findChild(node, "identifier");
      if (id) exports.push({ name: id.text.trim(), type: "interface" });
      break;
    }
    case "enum_declaration": {
      if (!hasModifier(node, "public")) break;
      const id = findChild(node, "identifier");
      if (id) exports.push({ name: id.text.trim(), type: "enum" });
      break;
    }
    case "method_declaration": {
      if (!hasModifier(node, "public")) break;
      const id = findChild(node, "identifier");
      if (id) exports.push({ name: id.text.trim(), type: "function" });
      break;
    }
    case "field_declaration": {
      if (!hasModifier(node, "public")) break;
      const isStatic = hasModifier(node, "static");
      const isFinal = hasModifier(node, "final");
      if (isStatic && isFinal) {
        const declarator = findChild(node, "variable_declarator");
        if (declarator) {
          const id = findChild(declarator, "identifier");
          if (id) exports.push({ name: id.text.trim(), type: "constant" });
        }
      }
      break;
    }
  }
}

function extractExportsJava(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    extractExportsFromNode(node, exports);
    // Also check inside class bodies for public methods/fields
    if (node.type === "class_declaration" || node.type === "interface_declaration") {
      const body = findChild(node, "class_body") ?? findChild(node, "interface_body");
      if (body) {
        for (const member of body.children) {
          extractExportsFromNode(member, exports);
        }
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsJava(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "import_declaration") continue;

    const text = node.text.trim();
    const isStatic = text.includes("static ");

    // Extract the full import path
    // Remove "import", "static", and ";"
    let importPath = text
      .replace(/^import\s+/, "")
      .replace(/^static\s+/, "")
      .replace(/;$/, "")
      .trim();

    // Handle wildcard imports: import com.example.*
    const isWildcard = importPath.endsWith(".*");
    if (isWildcard) {
      importPath = importPath.slice(0, -2);
    }

    // Extract the symbol name (last segment) and package path
    const lastDot = importPath.lastIndexOf(".");
    if (lastDot >= 0 && !isWildcard) {
      const pkg = importPath.slice(0, lastDot);
      const symbolName = importPath.slice(lastDot + 1);
      imports.push({
        specifier: pkg,
        symbols: [{ name: symbolName, isTypeOnly: false }],
        isTypeOnly: false,
        isReExport: false,
        isDefault: false,
        isNamespace: false,
      });
    } else {
      imports.push({
        specifier: importPath,
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

function resolveImportPathJava(
  _specifier: string,
  _fromFile: string,
  _allFileSet: Set<string>
): string | null {
  // Java uses package-based imports that don't map directly to relative paths.
  // Would need build config (Maven/Gradle) to determine source roots and package layout.
  // For now, return null — Java imports are classified by package prefix heuristic.
  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportJava(specifier: string): boolean {
  // Java stdlib and third-party packages
  // Heuristic: java.*, javax.*, org.*, com.sun.* are always external
  // Everything else depends on project config — we treat all as external
  // since we can't resolve Java imports without build tool knowledge
  return true;
}

function extractPackageNameJava(specifier: string): string {
  // Top-level package: com.example.core → com.example
  // java.util → java.util
  const parts = specifier.split(".");
  if (parts.length >= 2) {
    return parts.slice(0, 2).join(".");
  }
  return specifier;
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const javaExtractor: LanguageExtractor = {
  grammarNames: ["java"],
  extensions: [".java"],
  extractExports: extractExportsJava,
  extractImports: extractImportsJava,
  isExternalImport: isExternalImportJava,
  extractPackageName: extractPackageNameJava,
  resolveImportPath: resolveImportPathJava,
};
