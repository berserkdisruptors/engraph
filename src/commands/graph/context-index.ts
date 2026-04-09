import path from "path";
import fs from "fs-extra";
import { parse, stringify } from "yaml";

export interface ContextIndexOptions {
  debug?: boolean;
}

interface IndexEntry {
  id: string;
  path: string;
  provenance: string;
}

interface ConventionEntry extends IndexEntry {
  applies_to_modules: string[];
}

interface VerificationEntry extends IndexEntry {
  triggered_by_modules: string[];
}

interface ContextIndex {
  version: string;
  generated_at: string;
  codegraph_hash: string;
  conventions: ConventionEntry[];
  verification: VerificationEntry[];
}

const INDEX_HEADER = [
  "# Engraph Context Index — Routing Table",
  "# Regenerated deterministically by `engraph graph`.",
  "# Source of truth: individual convention/verification YAML files.",
  "# If this file drifts or is missing, regenerate with `engraph graph`.",
  "",
].join("\n");

/**
 * Regenerate `.engraph/context/_index.yaml` from convention/verification files.
 *
 * Reads bridge fields from individual YAML files and produces a routing table
 * that the `lookup` command uses for fast module-scoped queries.
 *
 * Called as the final step of `engraph graph`, after codegraph generation.
 */
export async function regenerateContextIndex(
  projectPath: string,
  codegraphHash: string,
  options: ContextIndexOptions = {}
): Promise<void> {
  const { debug = false } = options;
  const contextDir = path.join(projectPath, ".engraph", "context");

  if (!(await fs.pathExists(contextDir))) {
    if (debug) {
      console.log("[context-index] no .engraph/context/ directory, skipping");
    }
    return;
  }

  const conventions = await scanDomain<ConventionEntry>(
    path.join(contextDir, "conventions"),
    "applies_to_modules",
    debug
  );

  const verification = await scanDomain<VerificationEntry>(
    path.join(contextDir, "verification"),
    "triggered_by_modules",
    debug
  );

  // Check for duplicate IDs across both domains
  const allIds = new Set<string>();
  for (const entry of [...conventions, ...verification]) {
    if (allIds.has(entry.id)) {
      console.warn(`[context-index] warning: duplicate id "${entry.id}"`);
    }
    allIds.add(entry.id);
  }

  const index: ContextIndex = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    codegraph_hash: codegraphHash,
    conventions,
    verification,
  };

  const yamlContent = stringify(index, {
    lineWidth: 120,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });

  const indexPath = path.join(contextDir, "_index.yaml");
  await fs.writeFile(indexPath, INDEX_HEADER + yamlContent, "utf8");

  if (debug) {
    console.log(
      `[context-index] written to .engraph/context/_index.yaml ` +
        `(${conventions.length} conventions, ${verification.length} verification)`
    );
  }
}

/**
 * Scan a domain directory for YAML files and extract index entries.
 */
async function scanDomain<T extends IndexEntry>(
  domainDir: string,
  bridgeField: string,
  debug: boolean
): Promise<T[]> {
  if (!(await fs.pathExists(domainDir))) {
    return [];
  }

  const files = await fs.readdir(domainDir);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && f !== "_schema.yaml"
  );

  const entries: T[] = [];

  for (const file of yamlFiles.sort()) {
    const filePath = path.join(domainDir, file);
    try {
      const content = await fs.readFile(filePath, "utf8");
      const parsed = parse(content);

      if (!parsed?.id) {
        if (debug) {
          console.log(`[context-index] skipping ${file}: no id field`);
        }
        continue;
      }

      const entry: Record<string, unknown> = {
        id: parsed.id,
        path: `${path.basename(domainDir)}/${file}`,
        [bridgeField]: parsed[bridgeField] ?? ["*"],
        provenance: parsed.provenance ?? "manual",
      };

      entries.push(entry as T);
    } catch (err) {
      console.warn(`[context-index] warning: failed to parse ${file}: ${err}`);
    }
  }

  return entries;
}
