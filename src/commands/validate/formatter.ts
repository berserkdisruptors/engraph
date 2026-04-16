import type { Finding, ValidateResult } from "./types.js";

/**
 * Sort findings by file path, then by code for stable ordering across runs.
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const fileCompare = a.file.localeCompare(b.file);
    if (fileCompare !== 0) return fileCompare;
    return a.code.localeCompare(b.code);
  });
}

/**
 * Build the structured JSON output from collected findings.
 */
export function formatResult(
  findings: Finding[],
  codegraphPath: string,
  filesChecked: number
): ValidateResult {
  const sorted = sortFindings(findings);
  const errors = sorted.filter((f) => f.severity === "error").length;
  const warnings = sorted.filter((f) => f.severity === "warning").length;
  const info = sorted.filter((f) => f.severity === "info").length;

  return {
    status: errors > 0 ? "error" : "ok",
    codegraph_path: codegraphPath,
    files_checked: filesChecked,
    findings: sorted,
    summary: { errors, warnings, info },
  };
}

/**
 * Determine exit code from a ValidateResult.
 *
 * - 0: no errors remain
 * - 1: unresolved errors
 * - 2: command could not run (missing codegraph)
 */
export function getExitCode(result: ValidateResult): number {
  // Check for missing codegraph (exit 2)
  if (result.findings.some((f) => f.code === "ENGRAPH_MISSING_CODEGRAPH")) {
    return 2;
  }
  return result.summary.errors > 0 ? 1 : 0;
}
