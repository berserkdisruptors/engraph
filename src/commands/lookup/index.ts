import path from "path";
import fs from "fs-extra";
import { parse } from "yaml";
import { buildAliasMap, resolveModuleInputs } from "../shared/alias-resolver.js";
import { matchModuleGlob } from "../shared/glob-match.js";

export interface LookupEntry {
  id: string;
  path: string;
  content: Record<string, unknown>;
}

export interface LookupResult {
  query_modules: string[];
  conventions: LookupEntry[];
  verifications: LookupEntry[];
  global_conventions: LookupEntry[];
}

export interface LookupOptions {
  debug?: boolean;
}

/**
 * Look up conventions and verification rules for given module IDs.
 *
 * Reads the context index (index.yaml) to determine which definition files
 * to load, then filters by bridge field glob matching against the query modules.
 */
export async function lookupModules(
  projectPath: string,
  moduleInputs: string[],
  options: LookupOptions = {}
): Promise<LookupResult> {
  const { debug = false } = options;
  const contextDir = path.join(projectPath, ".engraph", "context");

  // Resolve aliases
  const aliasMap = await buildAliasMap(projectPath);
  const resolvedModules = resolveModuleInputs(moduleInputs, aliasMap);

  if (debug) {
    console.log(`[lookup] query modules: ${resolvedModules.join(", ")}`);
  }

  // Load index (or fall back to scanning)
  const index = await loadIndex(contextDir, debug);

  const conventions: LookupEntry[] = [];
  const globalConventions: LookupEntry[] = [];
  const verifications: LookupEntry[] = [];

  // Filter conventions
  for (const entry of index.conventions) {
    const modules = entry.applies_to_modules ?? ["*"];
    const isGlobal = modules.length === 1 && modules[0] === "*";
    const matches = isGlobal || matchesAny(resolvedModules, modules, aliasMap);

    if (matches) {
      const content = await readDefinitionFile(contextDir, entry.path);
      if (content) {
        const lookupEntry: LookupEntry = { id: entry.id, path: entry.path, content };
        if (isGlobal) {
          globalConventions.push(lookupEntry);
        } else {
          conventions.push(lookupEntry);
        }
      }
    }
  }

  // Filter verifications
  for (const entry of index.verifications) {
    const modules = entry.triggered_by_modules ?? ["*"];
    const matches =
      (modules.length === 1 && modules[0] === "*") ||
      matchesAny(resolvedModules, modules, aliasMap);

    if (matches) {
      const content = await readDefinitionFile(contextDir, entry.path);
      if (content) {
        verifications.push({ id: entry.id, path: entry.path, content });
      }
    }
  }

  if (debug) {
    console.log(
      `[lookup] found ${conventions.length} conventions, ` +
        `${globalConventions.length} global, ${verifications.length} verifications`
    );
  }

  return {
    query_modules: resolvedModules,
    conventions,
    verifications,
    global_conventions: globalConventions,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface IndexConventionEntry {
  id: string;
  path: string;
  applies_to_modules?: string[];
  provenance?: string;
}

interface IndexVerificationEntry {
  id: string;
  path: string;
  triggered_by_modules?: string[];
  provenance?: string;
}

interface ContextIndex {
  conventions: IndexConventionEntry[];
  verifications: IndexVerificationEntry[];
}

/**
 * Load the context index. Falls back to scanning all files if the index
 * is missing or corrupt.
 */
async function loadIndex(
  contextDir: string,
  debug: boolean
): Promise<ContextIndex> {
  const indexPath = path.join(contextDir, "index.yaml");

  if (await fs.pathExists(indexPath)) {
    try {
      const content = await fs.readFile(indexPath, "utf8");
      const parsed = parse(content);
      if (parsed?.conventions && parsed?.verifications) {
        return {
          conventions: parsed.conventions ?? [],
          verifications: parsed.verifications ?? [],
        };
      }
    } catch {
      // Fall through to scanning
    }
    if (debug) {
      console.log("[lookup] index.yaml corrupt, falling back to file scan");
    }
  } else if (debug) {
    console.log("[lookup] index.yaml missing, falling back to file scan");
  }

  // Fallback: scan all files directly
  console.warn(
    "[lookup] warning: index.yaml missing or corrupt, scanning files directly. Run `engraph graph` to regenerate."
  );
  return scanAllFiles(contextDir);
}

/**
 * Fallback: scan convention/verification directories directly.
 */
async function scanAllFiles(contextDir: string): Promise<ContextIndex> {
  const conventions: IndexConventionEntry[] = [];
  const verifications: IndexVerificationEntry[] = [];

  const convDir = path.join(contextDir, "conventions");
  if (await fs.pathExists(convDir)) {
    const files = (await fs.readdir(convDir)).filter(
      (f) => f.endsWith(".yaml") && f !== "_schema.yaml"
    );
    for (const file of files.sort()) {
      try {
        const content = await fs.readFile(path.join(convDir, file), "utf8");
        const parsed = parse(content);
        if (parsed?.id) {
          conventions.push({
            id: parsed.id,
            path: `conventions/${file}`,
            applies_to_modules: parsed.applies_to_modules ?? ["*"],
            provenance: parsed.provenance ?? "manual",
          });
        }
      } catch {
        // skip
      }
    }
  }

  const verDir = path.join(contextDir, "verifications");
  if (await fs.pathExists(verDir)) {
    const files = (await fs.readdir(verDir)).filter(
      (f) => f.endsWith(".yaml") && f !== "_schema.yaml"
    );
    for (const file of files.sort()) {
      try {
        const content = await fs.readFile(path.join(verDir, file), "utf8");
        const parsed = parse(content);
        if (parsed?.id) {
          verifications.push({
            id: parsed.id,
            path: `verifications/${file}`,
            triggered_by_modules: parsed.triggered_by_modules ?? ["*"],
            provenance: parsed.provenance ?? "manual",
          });
        }
      } catch {
        // skip
      }
    }
  }

  return { conventions, verifications };
}

/**
 * Check if any query module matches any bridge field pattern.
 */
function matchesAny(
  queryModules: string[],
  bridgePatterns: string[],
  aliasMap: { aliasToModuleId: Map<string, string> }
): boolean {
  // Resolve any aliases in bridge patterns to module IDs
  const resolvedPatterns = bridgePatterns.map((p) =>
    aliasMap.aliasToModuleId.has(p)
      ? aliasMap.aliasToModuleId.get(p)!
      : p
  );

  for (const queryModule of queryModules) {
    for (const pattern of resolvedPatterns) {
      if (matchModuleGlob(queryModule, pattern)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Read a definition file relative to the context directory.
 */
async function readDefinitionFile(
  contextDir: string,
  relativePath: string
): Promise<Record<string, unknown> | null> {
  try {
    const filePath = path.join(contextDir, relativePath);
    const content = await fs.readFile(filePath, "utf8");
    return parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}
