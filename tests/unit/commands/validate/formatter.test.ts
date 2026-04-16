import { describe, it, expect } from "vitest";
import {
  sortFindings,
  formatResult,
  getExitCode,
} from "../../../../src/commands/validate/formatter.js";
import type { Finding, ValidateResult } from "../../../../src/commands/validate/types.js";

describe("sortFindings", () => {
  it("sorts by file path then by code", () => {
    const findings: Finding[] = [
      {
        code: "ENGRAPH_UNRESOLVABLE_REFERENCE",
        severity: "error",
        file: "conventions/b.yaml",
        detail: {},
      },
      {
        code: "ENGRAPH_SCHEMA_INVALID",
        severity: "error",
        file: "conventions/a.yaml",
        detail: {},
      },
      {
        code: "ENGRAPH_UNRESOLVABLE_REFERENCE",
        severity: "error",
        file: "conventions/a.yaml",
        detail: {},
      },
    ];
    const sorted = sortFindings(findings);
    expect(sorted[0].file).toBe("conventions/a.yaml");
    expect(sorted[0].code).toBe("ENGRAPH_SCHEMA_INVALID");
    expect(sorted[1].file).toBe("conventions/a.yaml");
    expect(sorted[1].code).toBe("ENGRAPH_UNRESOLVABLE_REFERENCE");
    expect(sorted[2].file).toBe("conventions/b.yaml");
  });
});

describe("formatResult", () => {
  it("produces correct structure with status ok when no errors", () => {
    const findings: Finding[] = [
      {
        code: "ENGRAPH_UNRESOLVABLE_FILE_PATH",
        severity: "warning",
        file: "conventions/a.yaml",
        detail: { field: "reference_files[0]", value: "x", reason: "y" },
      },
    ];
    const result = formatResult(findings, "/path/codegraph", 5);
    expect(result.status).toBe("ok");
    expect(result.codegraph_path).toBe("/path/codegraph");
    expect(result.files_checked).toBe(5);
    expect(result.summary).toEqual({ errors: 0, warnings: 1, info: 0 });
  });

  it("produces status error when errors exist", () => {
    const findings: Finding[] = [
      {
        code: "ENGRAPH_SCHEMA_INVALID",
        severity: "error",
        file: "conventions/a.yaml",
        detail: { field: "id", reason: "missing" },
      },
    ];
    const result = formatResult(findings, "/path/codegraph", 1);
    expect(result.status).toBe("error");
    expect(result.summary.errors).toBe(1);
  });

  it("summary counts match findings length", () => {
    const findings: Finding[] = [
      { code: "ENGRAPH_SCHEMA_INVALID", severity: "error", file: "a", detail: {} },
      { code: "ENGRAPH_UNRESOLVABLE_FILE_PATH", severity: "warning", file: "b", detail: {} },
      { code: "ENGRAPH_REFERENCE_REMOVED", severity: "info", file: "c", detail: {} },
    ];
    const result = formatResult(findings, "/path", 3);
    const total =
      result.summary.errors + result.summary.warnings + result.summary.info;
    expect(total).toBe(result.findings.length);
  });
});

describe("getExitCode", () => {
  it("returns 0 when no errors", () => {
    const result: ValidateResult = {
      status: "ok",
      codegraph_path: "",
      files_checked: 0,
      findings: [],
      summary: { errors: 0, warnings: 0, info: 0 },
    };
    expect(getExitCode(result)).toBe(0);
  });

  it("returns 1 when errors exist", () => {
    const result: ValidateResult = {
      status: "error",
      codegraph_path: "",
      files_checked: 1,
      findings: [
        {
          code: "ENGRAPH_SCHEMA_INVALID",
          severity: "error",
          file: "a",
          detail: {},
        },
      ],
      summary: { errors: 1, warnings: 0, info: 0 },
    };
    expect(getExitCode(result)).toBe(1);
  });

  it("returns 2 for missing codegraph", () => {
    const result: ValidateResult = {
      status: "error",
      codegraph_path: "",
      files_checked: 0,
      findings: [
        {
          code: "ENGRAPH_MISSING_CODEGRAPH",
          severity: "error",
          file: "",
          detail: { expected_path: "/path" },
        },
      ],
      summary: { errors: 1, warnings: 0, info: 0 },
    };
    expect(getExitCode(result)).toBe(2);
  });

  it("returns 0 when only warnings and info", () => {
    const result: ValidateResult = {
      status: "ok",
      codegraph_path: "",
      files_checked: 2,
      findings: [
        {
          code: "ENGRAPH_UNRESOLVABLE_FILE_PATH",
          severity: "warning",
          file: "a",
          detail: {},
        },
      ],
      summary: { errors: 0, warnings: 1, info: 0 },
    };
    expect(getExitCode(result)).toBe(0);
  });
});
