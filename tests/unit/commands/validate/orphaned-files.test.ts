import { describe, it, expect } from "vitest";
import { checkOrphanedFiles } from "../../../../src/commands/validate/checks/orphaned-files.js";
import type { AliasMap } from "../../../../src/commands/shared/alias-resolver.js";
import type { ParsedContextFile } from "../../../../src/commands/validate/types.js";

function makeAliasMap(moduleIds: string[]): AliasMap {
  return {
    aliasToModuleId: new Map(),
    moduleIdToAlias: new Map(),
    allModuleIds: new Set(moduleIds),
  };
}

function makeFile(
  type: string,
  modules: string[]
): ParsedContextFile {
  const fieldName =
    type === "verification" ? "triggered_by_modules" : "applies_to_modules";
  return {
    filePath: "/tmp/test.yaml",
    relativePath: `${type === "verification" ? "verification" : "conventions"}/test.yaml`,
    content: { type, [fieldName]: modules },
  };
}

describe("checkOrphanedFiles", () => {
  const aliasMap = makeAliasMap(["auth", "api"]);

  it("returns no findings when at least one reference resolves", () => {
    const file = makeFile("convention", ["auth", "nonexistent"]);
    expect(checkOrphanedFiles([file], aliasMap)).toEqual([]);
  });

  it("returns no findings for glob patterns", () => {
    const file = makeFile("convention", ["*"]);
    expect(checkOrphanedFiles([file], aliasMap)).toEqual([]);
  });

  it("reports orphaned file when all references are unresolvable", () => {
    const file = makeFile("convention", ["payments", "billing"]);
    const findings = checkOrphanedFiles([file], aliasMap);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_ORPHANED_FILE");
    expect(findings[0].severity).toBe("error");
  });

  it("reports orphaned file when bridge field array is empty", () => {
    const file = makeFile("convention", []);
    const findings = checkOrphanedFiles([file], aliasMap);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_ORPHANED_FILE");
  });
});
