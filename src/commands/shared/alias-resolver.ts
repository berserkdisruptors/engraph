import path from "path";
import fs from "fs-extra";
import { parse } from "yaml";

export interface AliasMap {
  /** alias → full module ID */
  aliasToModuleId: Map<string, string>;
  /** full module ID → alias */
  moduleIdToAlias: Map<string, string>;
  /** all known module IDs (including those without aliases) */
  allModuleIds: Set<string>;
}

/**
 * Build alias maps from the codegraph.
 *
 * Reads `codegraph/index.yaml` and recursively follows `sub_graph` references
 * to collect all module IDs and their aliases.
 */
export async function buildAliasMap(projectPath: string): Promise<AliasMap> {
  const codegraphDir = path.join(projectPath, ".engraph", "codegraph");
  const rootIndexPath = path.join(codegraphDir, "index.yaml");

  const aliasToModuleId = new Map<string, string>();
  const moduleIdToAlias = new Map<string, string>();
  const allModuleIds = new Set<string>();

  if (!(await fs.pathExists(rootIndexPath))) {
    return { aliasToModuleId, moduleIdToAlias, allModuleIds };
  }

  await collectModules(
    rootIndexPath,
    codegraphDir,
    aliasToModuleId,
    moduleIdToAlias,
    allModuleIds
  );

  return { aliasToModuleId, moduleIdToAlias, allModuleIds };
}

async function collectModules(
  indexPath: string,
  codegraphDir: string,
  aliasToModuleId: Map<string, string>,
  moduleIdToAlias: Map<string, string>,
  allModuleIds: Set<string>
): Promise<void> {
  try {
    const content = await fs.readFile(indexPath, "utf8");
    const parsed = parse(content);
    const modules = parsed?.modules ?? [];

    for (const mod of modules) {
      if (!mod?.id) continue;

      allModuleIds.add(mod.id);

      if (mod.alias) {
        aliasToModuleId.set(mod.alias, mod.id);
        moduleIdToAlias.set(mod.id, mod.alias);
      }

      // Recursively follow sub_graph references
      if (mod.sub_graph) {
        // sub_graph paths are relative to .engraph/ (e.g., "codegraph/commands/index.yaml")
        // We need to resolve from the codegraph dir's parent (.engraph/)
        const engraphDir = path.dirname(codegraphDir);
        const subGraphPath = path.join(engraphDir, mod.sub_graph);
        await collectModules(
          subGraphPath,
          codegraphDir,
          aliasToModuleId,
          moduleIdToAlias,
          allModuleIds
        );
      }
    }
  } catch {
    // Silently skip unparseable files
  }
}

/**
 * Resolve a list of user inputs (module IDs, aliases, or glob patterns) to full module IDs.
 *
 * - If an input matches an alias, it resolves to the alias's module ID.
 * - If an input is already a module ID, it passes through.
 * - Glob patterns ("*", "auth/*") pass through unresolved — they're handled at match time.
 */
export function resolveModuleInputs(
  inputs: string[],
  aliasMap: AliasMap
): string[] {
  return inputs.map((input) => {
    // If it's a glob pattern, pass through
    if (input.includes("*")) {
      return input;
    }
    // If it's an alias, resolve to module ID
    if (aliasMap.aliasToModuleId.has(input)) {
      return aliasMap.aliasToModuleId.get(input)!;
    }
    // Otherwise treat as a module ID directly
    return input;
  });
}
