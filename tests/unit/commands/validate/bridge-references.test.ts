import { describe, it, expect } from "vitest";
import { checkBridgeReferences } from "../../../../src/commands/validate/checks/bridge-references.js";
import type { AliasMap } from "../../../../src/commands/shared/alias-resolver.js";
import type { ParsedContextFile } from "../../../../src/commands/validate/types.js";

function makeAliasMap(
  moduleIds: string[],
  aliases: Record<string, string> = {}
): AliasMap {
  const aliasToModuleId = new Map(Object.entries(aliases));
  const moduleIdToAlias = new Map(
    Object.entries(aliases).map(([a, m]) => [m, a])
  );
  return {
    aliasToModuleId,
    moduleIdToAlias,
    allModuleIds: new Set(moduleIds),
  };
}

function makeFile(
  type: string,
  modules: string[],
  relativePath = "conventions/test.yaml"
): ParsedContextFile {
  const fieldName =
    type === "verification" ? "triggered_by_modules" : "applies_to_modules";
  return {
    filePath: `/tmp/${relativePath}`,
    relativePath,
    content: { type, [fieldName]: modules },
  };
}

describe("checkBridgeReferences", () => {
  const aliasMap = makeAliasMap(["auth", "auth/providers", "api"], {
    providers: "auth/providers",
  });

  it("returns no findings when all references resolve as module IDs", () => {
    const file = makeFile("convention", ["auth", "api"]);
    expect(checkBridgeReferences([file], aliasMap)).toEqual([]);
  });

  it("returns no findings when reference resolves as alias", () => {
    const file = makeFile("convention", ["providers"]);
    expect(checkBridgeReferences([file], aliasMap)).toEqual([]);
  });

  it("returns no findings for glob patterns", () => {
    const file = makeFile("convention", ["auth/*", "*"]);
    expect(checkBridgeReferences([file], aliasMap)).toEqual([]);
  });

  it("reports unresolvable module ID", () => {
    const file = makeFile("convention", ["nonexistent"]);
    const findings = checkBridgeReferences([file], aliasMap);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_UNRESOLVABLE_REFERENCE");
    expect(findings[0].detail.value).toBe("nonexistent");
    expect(findings[0].detail.field).toBe("applies_to_modules");
  });

  it("reports unresolvable reference in verification files", () => {
    const file = makeFile(
      "verification",
      ["missing"],
      "verification/test.yaml"
    );
    const findings = checkBridgeReferences([file], aliasMap);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail.field).toBe("triggered_by_modules");
  });

  it("reports only unresolvable entries, not valid ones", () => {
    const file = makeFile("convention", ["auth", "nonexistent", "api"]);
    const findings = checkBridgeReferences([file], aliasMap);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail.value).toBe("nonexistent");
  });
});
