/**
 * Python language extractor.
 *
 * Handles .py files. Python has no explicit export keyword — all top-level
 * declarations are considered exports unless __all__ restricts visibility.
 * Imports use import_statement and import_from_statement nodes.
 */

import path from "path";
import type { ExportedSymbol, SymbolKind } from "../types.js";
import type { LanguageExtractor, RawImport, RawImportedSymbol, SyntaxNode, Tree } from "./types.js";

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

function isUpperCase(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function extractAllList(root: SyntaxNode): Set<string> | null {
  // Look for __all__ = ['name1', 'name2', ...]
  for (const node of root.children) {
    if (node.type === "expression_statement") {
      const assignment = findChild(node, "assignment");
      if (!assignment) continue;
      const identifier = findChild(assignment, "identifier");
      if (!identifier || identifier.text.trim() !== "__all__") continue;
      const list = findChild(assignment, "list");
      if (!list) continue;
      const names = new Set<string>();
      for (const child of list.children) {
        if (child.type === "string") {
          // Strip quotes from string literals
          const name = child.text.replace(/^['"]|['"]$/g, "");
          if (name) names.add(name);
        }
      }
      return names;
    }
  }
  return null;
}

function extractExportsPython(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;
  const allList = extractAllList(root);

  for (const node of root.children) {
    let name: string | null = null;
    let kind: SymbolKind = "function";

    switch (node.type) {
      case "function_definition": {
        const id = findChild(node, "identifier");
        if (id) {
          name = id.text.trim();
          kind = "function";
        }
        break;
      }
      case "class_definition": {
        const id = findChild(node, "identifier");
        if (id) {
          name = id.text.trim();
          kind = "class";
        }
        break;
      }
      case "expression_statement": {
        const assignment = findChild(node, "assignment");
        if (assignment) {
          const id = findChild(assignment, "identifier");
          if (id) {
            const n = id.text.trim();
            if (n !== "__all__" && isUpperCase(n)) {
              name = n;
              kind = "constant";
            }
          }
        }
        break;
      }
      case "type_alias_statement": {
        // Python 3.12+ type statement
        const typeChildren = findChildren(node, "type");
        if (typeChildren.length >= 2) {
          const id = findChild(typeChildren[1], "identifier");
          if (id) {
            name = id.text.trim();
            kind = "type";
          }
        }
        break;
      }
    }

    if (name) {
      // If __all__ exists, only export names in the list
      if (allList && !allList.has(name)) continue;
      // Skip private names (starting with _)
      if (name.startsWith("_") && !allList?.has(name)) continue;
      exports.push({ name, type: kind });
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsPython(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type === "import_statement") {
      // import os, import os.path
      const dottedNames = findChildren(node, "dotted_name");
      for (const dn of dottedNames) {
        imports.push({
          specifier: dn.text.trim(),
          symbols: [],
          isTypeOnly: false,
          isReExport: false,
          isDefault: false,
          isNamespace: true,
        });
      }
    } else if (node.type === "import_from_statement") {
      // from X import Y, Z  or  from . import Y
      let specifier = "";

      const relativeImport = findChild(node, "relative_import");
      if (relativeImport) {
        const prefix = findChild(relativeImport, "import_prefix");
        const dottedName = findChild(relativeImport, "dotted_name");
        specifier = (prefix?.text ?? "") + (dottedName?.text ?? "");
      } else {
        const dottedName = findChild(node, "dotted_name");
        if (dottedName) {
          specifier = dottedName.text.trim();
        }
      }

      if (!specifier) continue;

      // Collect imported names (everything after "import" keyword)
      const symbols: RawImportedSymbol[] = [];
      let afterImport = false;
      for (const child of node.children) {
        if (child.type === "import") {
          afterImport = true;
          continue;
        }
        if (afterImport && child.type === "dotted_name") {
          const id = findChild(child, "identifier");
          if (id) {
            symbols.push({ name: id.text.trim(), isTypeOnly: false });
          }
        }
      }

      imports.push({
        specifier,
        symbols,
        isTypeOnly: false,
        isReExport: false,
        isDefault: false,
        isNamespace: symbols.length === 0,
      });
    }
  }

  return imports;
}

// ─── Resolution ────────────────────────────────────────────────────────────

function resolveImportPathPython(
  specifier: string,
  fromFile: string,
  allFileSet: Set<string>
): string | null {
  if (!specifier.startsWith(".")) return null;

  const fromDir = path.dirname(fromFile);
  const dots = specifier.match(/^\.+/)?.[0] ?? ".";
  const rest = specifier.slice(dots.length);

  // Navigate up directories based on number of dots
  let baseDir = fromDir;
  for (let i = 1; i < dots.length; i++) {
    baseDir = path.dirname(baseDir);
  }

  const modulePath = rest ? rest.replace(/\./g, "/") : "";
  const resolved = modulePath
    ? path.join(baseDir, modulePath).replace(/\\/g, "/")
    : baseDir.replace(/\\/g, "/");

  // Try as a file
  const pyFile = resolved + ".py";
  if (allFileSet.has(pyFile)) return pyFile;

  // Try as a package
  const initFile = resolved + "/__init__.py";
  if (allFileSet.has(initFile)) return initFile;

  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportPython(specifier: string): boolean {
  return !specifier.startsWith(".");
}

function extractPackageNamePython(specifier: string): string {
  return specifier.split(".")[0];
}

// ─── Extractor Instance ────────────────────────────────────────────────────

export const pythonExtractor: LanguageExtractor = {
  grammarNames: ["python"],
  extensions: [".py"],
  extractExports: extractExportsPython,
  extractImports: extractImportsPython,
  isExternalImport: isExternalImportPython,
  extractPackageName: extractPackageNamePython,
  resolveImportPath: resolveImportPathPython,
};
