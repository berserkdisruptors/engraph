import type { AliasMap } from "../../shared/alias-resolver.js";
import type { Finding, ParsedContextFile } from "../types.js";

/**
 * Check that bridge field entries (applies_to_modules, triggered_by_modules)
 * resolve against the current codegraph.
 *
 * - Exact module IDs must exist in allModuleIds
 * - Aliases must exist in aliasToModuleId
 * - Glob patterns (containing *) pass through — they are syntactically valid by nature
 */
export function checkBridgeReferences(
  files: ParsedContextFile[],
  aliasMap: AliasMap
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

    for (const entry of modules) {
      if (typeof entry !== "string") continue;

      // Glob patterns pass through
      if (entry.includes("*")) continue;

      // Check if it resolves as a module ID or alias
      const isModuleId = aliasMap.allModuleIds.has(entry);
      const isAlias = aliasMap.aliasToModuleId.has(entry);

      if (!isModuleId && !isAlias) {
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

  return findings;
}
