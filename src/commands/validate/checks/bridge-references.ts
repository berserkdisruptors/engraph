import { isSeq } from "yaml";
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
 * With fix=true, unresolvable entries are removed from the document AST
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

    // Collect indices to remove (reverse order for safe splicing)
    const removeIndices: number[] = [];

    for (let i = 0; i < modules.length; i++) {
      const entry = modules[i];
      if (typeof entry !== "string") continue;

      if (!resolves(entry, aliasMap)) {
        if (fix) {
          removeIndices.push(i);
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

    if (fix && removeIndices.length > 0) {
      // Update plain object for downstream checks (orphan detection)
      content[fieldName] = modules.filter(
        (_, i) => !removeIndices.includes(i)
      );

      // Update document AST for format-preserving write
      if (file.document) {
        const seq = file.document.getIn([fieldName], true);
        if (isSeq(seq)) {
          // Remove in reverse order to keep indices valid
          for (const idx of [...removeIndices].reverse()) {
            seq.items.splice(idx, 1);
          }
        }
      }

      file.modified = true;
    }
  }

  return findings;
}
