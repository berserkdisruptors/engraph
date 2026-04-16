import type { AliasMap } from "../../shared/alias-resolver.js";
import type { Finding, ParsedContextFile } from "../types.js";

function resolves(entry: string, aliasMap: AliasMap): boolean {
  if (entry.includes("*")) return true;
  return aliasMap.allModuleIds.has(entry) || aliasMap.aliasToModuleId.has(entry);
}

/**
 * Check that bridge field entries (applies_to_modules, triggered_by_modules)
 * resolve against the current codegraph.
 *
 * With fix=true, unresolvable entries are removed from the array in place
 * and ENGRAPH_REFERENCE_REMOVED findings are emitted instead.
 */
export function checkBridgeReferences(
  files: ParsedContextFile[],
  aliasMap: AliasMap,
  fix = false
): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const content = file.content;
    const fieldName =
      content.type === "verification"
        ? "triggered_by_modules"
        : "applies_to_modules";

    const modules = content[fieldName];
    if (!Array.isArray(modules)) continue;

    const toRemove: string[] = [];

    for (const entry of modules) {
      if (typeof entry !== "string") continue;

      if (!resolves(entry, aliasMap)) {
        if (fix) {
          toRemove.push(entry);
          findings.push({
            code: "ENGRAPH_REFERENCE_REMOVED",
            severity: "info",
            file: file.relativePath,
            detail: {
              field: fieldName,
              removed: entry,
              reason: "Reference removed by --fix",
            },
          });
          file.modified = true;
        } else {
          findings.push({
            code: "ENGRAPH_UNRESOLVABLE_REFERENCE",
            severity: "error",
            file: file.relativePath,
            detail: {
              field: fieldName,
              value: entry,
              reason: "Module ID or alias not found in codegraph",
            },
          });
        }
      }
    }

    if (fix && toRemove.length > 0) {
      content[fieldName] = modules.filter(
        (m: unknown) => typeof m !== "string" || !toRemove.includes(m)
      );
    }
  }

  return findings;
}
