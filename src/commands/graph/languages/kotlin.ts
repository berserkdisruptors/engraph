/**
 * Kotlin language extractor.
 *
 * Handles .kt and .kts files. Kotlin declarations are public by default —
 * only private, internal, or protected modifiers restrict visibility.
 * Imports use import_header nodes inside an import_list.
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

function hasRestrictedVisibility(node: SyntaxNode): boolean {
  const modifiers = findChild(node, "modifiers");
  if (!modifiers) return false;
  return modifiers.children.some(
    (c) =>
      c.type === "visibility_modifier" &&
      (c.text === "private" || c.text === "internal" || c.text === "protected")
  );
}

function hasModifierText(node: SyntaxNode, text: string): boolean {
  const modifiers = findChild(node, "modifiers");
  if (!modifiers) return false;
  return modifiers.children.some((c) => c.text === text);
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsKotlin(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (hasRestrictedVisibility(node)) continue;

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

        // Check if it's an interface, enum, or regular class
        const isInterface = node.children.some((c) => c.type === "interface");
        const isEnum = node.children.some((c) => c.type === "enum");

        if (isInterface) {
          exports.push({ name, type: "interface" });
        } else if (isEnum) {
          exports.push({ name, type: "enum" });
        } else {
          exports.push({ name, type: "class" });
        }
        break;
      }
      case "object_declaration": {
        const id = findChild(node, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "class" });
        break;
      }
      case "type_alias": {
        const id = findChild(node, "type_identifier");
        if (id) exports.push({ name: id.text.trim(), type: "type" });
        break;
      }
      case "property_declaration": {
        if (hasModifierText(node, "const")) {
          const id = findChild(node, "variable_declaration");
          if (id) {
            const nameNode = findChild(id, "simple_identifier");
            if (nameNode) exports.push({ name: nameNode.text.trim(), type: "constant" });
          }
        }
        break;
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsKotlin(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  const importList = findChild(root, "import_list");
  if (!importList) return imports;

  for (const node of importList.children) {
    if (node.type !== "import_header") continue;

    const identifier = findChild(node, "identifier");
    if (!identifier) continue;

    const fullPath = identifier.text.trim();

    // Check for wildcard: import com.example.*
    const isWildcard = node.text.includes(".*");

    // Extract package and symbol
    const lastDot = fullPath.lastIndexOf(".");
    if (lastDot >= 0 && !isWildcard) {
      const pkg = fullPath.slice(0, lastDot);
      const symbolName = fullPath.slice(lastDot + 1);
      imports.push({
        specifier: pkg,
        symbols: [{ name: symbolName, isTypeOnly: false }],
        isTypeOnly: false,
        isReExport: false,
        isDefault: false,
        isNamespace: false,
      });
    } else {
      const specifier = isWildcard ? fullPath : fullPath;
      imports.push({
        specifier,
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

function resolveImportPathKotlin(
  _specifier: string,
  _fromFile: string,
  _allFileSet: Set<string>
): string | null {
  // Kotlin uses the same package-based import system as Java.
  // Would need Gradle/Maven config to resolve source roots.
  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportKotlin(specifier: string): boolean {
  // Same limitation as Java — all imports treated as external
  // without build tool knowledge
  return true;
}

function extractPackageNameKotlin(specifier: string): string {
  const parts = specifier.split(".");
  if (parts.length >= 2) {
    return parts.slice(0, 2).join(".");
  }
  return specifier;
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const kotlinExtractor: LanguageExtractor = {
  grammarNames: ["kotlin"],
  extensions: [".kt", ".kts"],
  extractExports: extractExportsKotlin,
  extractImports: extractImportsKotlin,
  isExternalImport: isExternalImportKotlin,
  extractPackageName: extractPackageNameKotlin,
  resolveImportPath: resolveImportPathKotlin,
};
