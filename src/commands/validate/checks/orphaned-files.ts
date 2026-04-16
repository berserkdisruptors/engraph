import type { AliasMap } from "../../shared/alias-resolver.js";
import type { Finding, ParsedContextFile } from "../types.js";

/**
 * Detect orphaned files — files where ALL bridge field references are unresolvable.
 *
 * A file is orphaned when none of its applies_to_modules or triggered_by_modules
 * entries resolve against the codegraph. File path breakage does NOT orphan a file.
 */
export function checkOrphanedFiles(
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
    if (!Array.isArray(modules) || modules.length === 0) {
      // No bridge field or empty array — orphaned
      findings.push({
        code: "ENGRAPH_ORPHANED_FILE",
        severity: "error",
        file: file.relativePath,
        detail: {
          reason: "All module references are unresolvable",
        },
      });
      continue;
    }

    // Check if ANY entry resolves
    const hasResolvable = modules.some((entry) => {
      if (typeof entry !== "string") return false;
      // Glob patterns always "resolve" (they are valid patterns)
      if (entry.includes("*")) return true;
      return aliasMap.allModuleIds.has(entry) || aliasMap.aliasToModuleId.has(entry);
    });

    if (!hasResolvable) {
      findings.push({
        code: "ENGRAPH_ORPHANED_FILE",
        severity: "error",
        file: file.relativePath,
        detail: {
          reason: "All module references are unresolvable",
        },
      });
    }
  }

  return findings;
}
