export type Severity = "error" | "warning" | "info";

export type FindingCode =
  | "ENGRAPH_MISSING_CODEGRAPH"
  | "ENGRAPH_SCHEMA_INVALID"
  | "ENGRAPH_DUPLICATE_ID"
  | "ENGRAPH_UNRESOLVABLE_REFERENCE"
  | "ENGRAPH_REFERENCE_REMOVED"
  | "ENGRAPH_ORPHANED_FILE"
  | "ENGRAPH_UNRESOLVABLE_FILE_PATH"
  | "ENGRAPH_FILE_PATH_REMOVED"
  | "ENGRAPH_INVALID_GLOB_SYNTAX";

export interface Finding {
  code: FindingCode;
  severity: Severity;
  file: string;
  detail: Record<string, unknown>;
}

export interface ValidateResult {
  status: "ok" | "error";
  codegraph_path: string;
  files_checked: number;
  findings: Finding[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface ValidateOptions {
  fix?: boolean;
}

export interface ParsedContextFile {
  filePath: string;
  relativePath: string;
  content: Record<string, unknown>;
  modified?: boolean;
}
