/**
 * TypeScript / TSX language extractor.
 *
 * Handles .ts and .tsx files. Extracts:
 * - Exports: named exports, default exports, re-exports, type exports
 * - Imports: named, default, namespace, type-only, re-exports
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

function hasChildType(node: SyntaxNode, type: string): boolean {
  return node.children.some((c) => c.type === type);
}

function stripQuotes(s: string): string {
  return s.replace(/^['"`]|['"`]$/g, "");
}

// ─── Export Extraction ─────────────────────────────────────────────────────

function classifyExportDeclaration(
  decl: SyntaxNode
): { name: string; kind: SymbolKind } | null {
  switch (decl.type) {
    case "function_declaration":
    case "function": {
      const nameNode = findChild(decl, "identifier");
      return nameNode ? { name: nameNode.text.trim(), kind: "function" } : null;
    }
    case "generator_function_declaration": {
      const nameNode = findChild(decl, "identifier");
      return nameNode ? { name: nameNode.text.trim(), kind: "function" } : null;
    }
    case "class_declaration": {
      const nameNode = findChild(decl, "type_identifier") ?? findChild(decl, "identifier");
      return nameNode ? { name: nameNode.text.trim(), kind: "class" } : null;
    }
    case "interface_declaration": {
      const nameNode = findChild(decl, "type_identifier");
      return nameNode ? { name: nameNode.text.trim(), kind: "interface" } : null;
    }
    case "type_alias_declaration": {
      const nameNode = findChild(decl, "type_identifier");
      return nameNode ? { name: nameNode.text.trim(), kind: "type" } : null;
    }
    case "enum_declaration": {
      const nameNode = findChild(decl, "identifier");
      return nameNode ? { name: nameNode.text.trim(), kind: "enum" } : null;
    }
    case "lexical_declaration": {
      const declarators = findChildren(decl, "variable_declarator");
      if (declarators.length > 0) {
        const nameNode = findChild(declarators[0], "identifier");
        if (nameNode) {
          const isConst = hasChildType(decl, "const");
          return { name: nameNode.text.trim(), kind: isConst ? "constant" : "function" };
        }
      }
      return null;
    }
    case "variable_declaration": {
      const declarators = findChildren(decl, "variable_declarator");
      if (declarators.length > 0) {
        const nameNode = findChild(declarators[0], "identifier");
        if (nameNode) {
          return { name: nameNode.text.trim(), kind: "constant" };
        }
      }
      return null;
    }
    default:
      return null;
  }
}

function extractExportsFromTree(tree: Tree, _filePath: string): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    if (node.type === "export_statement") {
      // Check for re-export: export { ... } from "..."
      const source = findChild(node, "string");
      if (source) continue;

      // Check for export clause without source (named re-exports from local)
      const exportClause = findChild(node, "export_clause");
      if (exportClause) {
        const specifiers = findChildren(exportClause, "export_specifier");
        for (const spec of specifiers) {
          const nameNode = findChild(spec, "identifier") ?? findChild(spec, "type_identifier");
          if (nameNode) {
            exports.push({ name: nameNode.text.trim(), type: "function" });
          }
        }
        continue;
      }

      // Check for default export
      const defaultKeyword = node.children.find((c) => c.type === "default");
      if (defaultKeyword) {
        let found = false;
        for (const child of node.children) {
          const classified = classifyExportDeclaration(child);
          if (classified) {
            exports.push({ name: classified.name, type: classified.kind });
            found = true;
            break;
          }
        }
        if (!found) {
          exports.push({ name: "default", type: "function" });
        }
        continue;
      }

      // Named export
      for (const child of node.children) {
        const classified = classifyExportDeclaration(child);
        if (classified) {
          exports.push({ name: classified.name, type: classified.kind });
        }
      }
    }
  }

  return exports;
}

// ─── Import Extraction ─────────────────────────────────────────────────────

function extractImportsFromTree(tree: Tree, _filePath: string): RawImport[] {
  const imports: RawImport[] = [];
  const root = tree.rootNode;

  for (const node of root.children) {
    // Standard imports: import ... from "..."
    if (node.type === "import_statement") {
      const sourceNode = findChild(node, "string");
      if (!sourceNode) continue;

      const specifier = stripQuotes(sourceNode.text.trim());
      const nodeText = node.text.trim();
      const isTypeImport = nodeText.startsWith("import type ");

      const importClause = findChild(node, "import_clause");
      if (!importClause) {
        imports.push({
          specifier,
          symbols: [],
          isTypeOnly: isTypeImport,
          isReExport: false,
          isDefault: false,
          isNamespace: false,
        });
        continue;
      }

      const symbols: RawImportedSymbol[] = [];
      let isDefault = false;
      let isNamespace = false;

      for (const child of importClause.children) {
        if (child.type === "identifier") {
          isDefault = true;
          symbols.push({ name: child.text.trim(), isTypeOnly: isTypeImport });
        } else if (child.type === "namespace_import") {
          isNamespace = true;
          const alias = findChild(child, "identifier");
          if (alias) {
            symbols.push({ name: alias.text.trim(), isTypeOnly: isTypeImport });
          }
        } else if (child.type === "named_imports") {
          const specifiers = findChildren(child, "import_specifier");
          for (const spec of specifiers) {
            const nameNode = findChild(spec, "identifier") ?? findChild(spec, "type_identifier");
            if (nameNode) {
              const symbolTypeOnly = isTypeImport || spec.text.startsWith("type ");
              symbols.push({ name: nameNode.text.trim(), isTypeOnly: symbolTypeOnly });
            }
          }
        }
      }

      imports.push({
        specifier,
        symbols,
        isTypeOnly: isTypeImport,
        isReExport: false,
        isDefault,
        isNamespace,
      });
    }

    // Re-exports: export { ... } from "..."
    if (node.type === "export_statement") {
      const sourceNode = findChild(node, "string");
      if (!sourceNode) continue;

      const specifier = stripQuotes(sourceNode.text.trim());
      const symbols: RawImportedSymbol[] = [];

      const exportClause = findChild(node, "export_clause");
      if (exportClause) {
        const specifiers = findChildren(exportClause, "export_specifier");
        for (const spec of specifiers) {
          const nameNode = findChild(spec, "identifier") ?? findChild(spec, "type_identifier");
          if (nameNode) {
            symbols.push({ name: nameNode.text.trim(), isTypeOnly: false });
          }
        }
      }

      const isNamespace = node.text.includes("export *");

      imports.push({
        specifier,
        symbols,
        isTypeOnly: false,
        isReExport: true,
        isDefault: false,
        isNamespace,
      });
    }
  }

  return imports;
}

// ─── Resolution ────────────────────────────────────────────────────────────

const TS_RESOLVE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  "/index.ts", "/index.tsx", "/index.js", "/index.jsx",
];

function resolveImportPathTS(
  specifier: string,
  fromFile: string,
  allFileSet: Set<string>
): string | null {
  const fromDir = path.dirname(fromFile);
  const resolved = path.join(fromDir, specifier).replace(/\\/g, "/");

  if (allFileSet.has(resolved)) return resolved;

  for (const ext of TS_RESOLVE_EXTENSIONS) {
    const candidate = resolved + ext;
    if (allFileSet.has(candidate)) return candidate;
  }

  // Try stripping .js extension and replacing with .ts (common ESM pattern)
  if (specifier.endsWith(".js")) {
    const stripped = specifier.slice(0, -3);
    const resolvedStripped = path.join(fromDir, stripped).replace(/\\/g, "/");
    for (const ext of [".ts", ".tsx"]) {
      const candidate = resolvedStripped + ext;
      if (allFileSet.has(candidate)) return candidate;
    }
    for (const ext of ["/index.ts", "/index.tsx"]) {
      const candidate = resolvedStripped + ext;
      if (allFileSet.has(candidate)) return candidate;
    }
  }

  return null;
}

// ─── External Detection ────────────────────────────────────────────────────

function isExternalImportTS(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/");
}

function extractPackageNameTS(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

// ─── Extractor Instances ───────────────────────────────────────────────────

export const typescriptExtractor: LanguageExtractor = {
  grammarNames: ["typescript"],
  extensions: [".ts"],
  extractExports: extractExportsFromTree,
  extractImports: extractImportsFromTree,
  isExternalImport: isExternalImportTS,
  extractPackageName: extractPackageNameTS,
  resolveImportPath: resolveImportPathTS,
};

export const tsxExtractor: LanguageExtractor = {
  grammarNames: ["tsx"],
  extensions: [".tsx"],
  extractExports: extractExportsFromTree,
  extractImports: extractImportsFromTree,
  isExternalImport: isExternalImportTS,
  extractPackageName: extractPackageNameTS,
  resolveImportPath: resolveImportPathTS,
};
