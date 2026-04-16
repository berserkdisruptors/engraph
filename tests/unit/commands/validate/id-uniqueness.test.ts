import { describe, it, expect } from "vitest";
import { checkIdUniqueness } from "../../../../src/commands/validate/checks/id-uniqueness.js";
import type { ParsedContextFile } from "../../../../src/commands/validate/types.js";

function makeFile(
  id: string,
  relativePath: string
): ParsedContextFile {
  return {
    filePath: `/tmp/${relativePath}`,
    relativePath,
    content: { id },
  };
}

describe("checkIdUniqueness", () => {
  it("returns no findings when all IDs are unique", () => {
    const files = [
      makeFile("conv-a", "conventions/a.yaml"),
      makeFile("conv-b", "conventions/b.yaml"),
      makeFile("ver-a", "verification/a.yaml"),
    ];
    expect(checkIdUniqueness(files)).toEqual([]);
  });

  it("reports duplicate IDs", () => {
    const files = [
      makeFile("shared-id", "conventions/first.yaml"),
      makeFile("shared-id", "conventions/second.yaml"),
    ];
    const findings = checkIdUniqueness(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_DUPLICATE_ID");
    expect(findings[0].detail.id).toBe("shared-id");
    expect(findings[0].detail.files).toEqual([
      "conventions/first.yaml",
      "conventions/second.yaml",
    ]);
  });

  it("skips files with missing or empty IDs", () => {
    const files = [
      makeFile("", "conventions/empty.yaml"),
      makeFile("valid", "conventions/valid.yaml"),
    ];
    expect(checkIdUniqueness(files)).toEqual([]);
  });
});
