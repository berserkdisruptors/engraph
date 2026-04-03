/**
 * Go language extractor.
 *
 * Handles .go files. Go exports are determined by capitalization — any
 * top-level identifier starting with an uppercase letter is exported.
 * Go imports packages, not individual symbols.
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

function findChildren(node: SyntaxNode, type: string): SyntaxNode[] {
  return node.children.filter((c) => c.type === type);
}

function isExported(name: string): boolean {
  return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractExportsGo(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    switch (node.type) {
      case "function_declaration": {
        const id = findChild(node, "identifier");
        if (id && isExported(id.text.trim())) {
          exports.push({ name: id.text.trim(), type: "function" });
        }
        break;
      }
      case "method_declaration": {
        const id = findChild(node, "field_identifier");
        if (id && isExported(id.text.trim())) {
          exports.push({ name: id.text.trim(), type: "function" });
        }
        break;
      }
      case "type_declaration": {
        const typeSpec = findChild(node, "type_spec");
        if (!typeSpec) break;
        const id = findChild(typeSpec, "type_identifier");
        if (!id || !isExported(id.text.trim())) break;

        const name = id.text.trim();
        const structType = findChild(typeSpec, "struct_type");
        const interfaceType = findChild(typeSpec, "interface_type");

        if (structType) {
          exports.push({ name, type: "class" });
        } else if (interfaceType) {
          exports.push({ name, type: "interface" });
        } else {
          exports.push({ name, type: "type" });
        }
        break;
      }
      case "const_declaration": {
        const constSpecs = findChildren(node, "const_spec");
        for (const spec of constSpecs) {
          const id = findChild(spec, "identifier");
          if (id && isExported(id.text.trim())) {
            exports.push({ name: id.text.trim(), type: "constant" });
          }
        }
        break;
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsGo(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type !== "import_declaration") continue;

    // Single import: import "fmt"
    const singleSpec = findChild(node, "import_spec");
    if (singleSpec) {
      const pathNode = findChild(singleSpec, "interpreted_string_literal");
      if (pathNode) {
        imports.push({
          specifier: stripQuotes(pathNode.text.trim()),
          symbols: [],
          isTypeOnly: false,
          isReExport: false,
          isDefault: false,
          isNamespace: true,
        });
      }
    }

    // Grouped imports: import ( "fmt" \n "os" )
    const specList = findChild(node, "import_spec_list");
    if (specList) {
      const specs = findChildren(specList, "import_spec");
      for (const spec of specs) {
        const pathNode = findChild(spec, "interpreted_string_literal");
        if (pathNode) {
          imports.push({
            specifier: stripQuotes(pathNode.text.trim()),
            symbols: [],
            isTypeOnly: false,
            isReExport: false,
            isDefault: false,
            isNamespace: true,
          });
        }
      }
    }
  }

  return imports;
}

// ─── Resolution ────────────────────────────────────────────────────────────

function resolveImportPathGo(
  specifier: string,
  fromFile: string,
  allFileSet: Set<string>
): string | null {
  // Go relative imports start with ./
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;

  const fromDir = path.dirname(fromFile);
  const resolved = path.join(fromDir, specifier).replace(/\\/g, "/");

  // Go imports packages (directories), not files. Check if any .go file
  // exists in the resolved directory.
  for (const file of allFileSet) {
    if (file.startsWith(resolved + "/") && file.endsWith(".go")) {
      return file;
    }
  }

  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportGo(specifier: string): boolean {
  // Go relative imports start with ./ or ../
  // Everything else is external (stdlib or module path)
  return !specifier.startsWith("./") && !specifier.startsWith("../");
}

function extractPackageNameGo(specifier: string): string {
  // For Go, the import path is the package identifier
  // github.com/org/repo/pkg → github.com/org/repo
  // Standard library: fmt, os, etc. → as-is
  const parts = specifier.split("/");
  if (parts.length >= 3 && parts[0].includes(".")) {
    // Looks like a module path: github.com/org/repo/...
    return parts.slice(0, 3).join("/");
  }
  return parts[0];
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const goExtractor: LanguageExtractor = {
  grammarNames: ["go"],
  extensions: [".go"],
  extractExports: extractExportsGo,
  extractImports: extractImportsGo,
  isExternalImport: isExternalImportGo,
  extractPackageName: extractPackageNameGo,
  resolveImportPath: resolveImportPathGo,
};
