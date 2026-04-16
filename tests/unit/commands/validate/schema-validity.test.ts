import { describe, it, expect } from "vitest";
import { checkSchemaValidity } from "../../../../src/commands/validate/checks/schema-validity.js";
import type { ParsedContextFile } from "../../../../src/commands/validate/types.js";

function makeFile(content: Record<string, unknown>): ParsedContextFile {
  return {
    filePath: "/tmp/test.yaml",
    relativePath: "conventions/test.yaml",
    content,
  };
}

describe("checkSchemaValidity", () => {
  it("returns no findings for a valid convention file", () => {
    const file = makeFile({
      id: "test-conv",
      type: "convention",
      applies_to_modules: ["auth/*"],
      provenance: "manual",
    });
    expect(checkSchemaValidity([file])).toEqual([]);
  });

  it("returns no findings for a valid verification file", () => {
    const file = makeFile({
      id: "test-ver",
      type: "verification",
      triggered_by_modules: ["*"],
      provenance: "detected",
    });
    expect(checkSchemaValidity([file])).toEqual([]);
  });

  it("reports missing id field", () => {
    const file = makeFile({
      type: "convention",
      applies_to_modules: ["*"],
      provenance: "manual",
    });
    const findings = checkSchemaValidity([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ENGRAPH_SCHEMA_INVALID");
    expect(findings[0].detail.field).toBe("id");
  });

  it("reports missing type field", () => {
    const file = makeFile({
      id: "test",
      applies_to_modules: ["*"],
      provenance: "manual",
    });
    const findings = checkSchemaValidity([file]);
    expect(findings.some((f) => f.detail.field === "type")).toBe(true);
  });

  it("reports missing applies_to_modules for convention", () => {
    const file = makeFile({
      id: "test",
      type: "convention",
      provenance: "manual",
    });
    const findings = checkSchemaValidity([file]);
    expect(
      findings.some((f) => f.detail.field === "applies_to_modules")
    ).toBe(true);
  });

  it("reports missing triggered_by_modules for verification", () => {
    const file = makeFile({
      id: "test",
      type: "verification",
      provenance: "manual",
    });
    const findings = checkSchemaValidity([file]);
    expect(
      findings.some((f) => f.detail.field === "triggered_by_modules")
    ).toBe(true);
  });

  it("reports missing provenance", () => {
    const file = makeFile({
      id: "test",
      type: "convention",
      applies_to_modules: ["*"],
    });
    const findings = checkSchemaValidity([file]);
    expect(findings.some((f) => f.detail.field === "provenance")).toBe(true);
  });

  it("reports invalid provenance value", () => {
    const file = makeFile({
      id: "test",
      type: "convention",
      applies_to_modules: ["*"],
      provenance: "invalid-value",
    });
    const findings = checkSchemaValidity([file]);
    expect(findings.some((f) => f.detail.field === "provenance")).toBe(true);
  });

  it("reports non-array applies_to_modules", () => {
    const file = makeFile({
      id: "test",
      type: "convention",
      applies_to_modules: "not-an-array",
      provenance: "manual",
    });
    const findings = checkSchemaValidity([file]);
    expect(
      findings.some((f) => f.detail.field === "applies_to_modules")
    ).toBe(true);
  });

  it("reports empty string id", () => {
    const file = makeFile({
      id: "",
      type: "convention",
      applies_to_modules: ["*"],
      provenance: "manual",
    });
    const findings = checkSchemaValidity([file]);
    expect(findings.some((f) => f.detail.field === "id")).toBe(true);
  });
});
