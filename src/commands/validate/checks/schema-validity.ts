import type { Finding, ParsedContextFile } from "../types.js";

const CONVENTION_REQUIRED_FIELDS = ["id", "type", "applies_to_modules", "provenance"] as const;
const VERIFICATION_REQUIRED_FIELDS = ["id", "type", "triggered_by_modules", "provenance"] as const;

export function checkSchemaValidity(files: ParsedContextFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const content = file.content;
    const fileType = content.type;

    const requiredFields =
      fileType === "verification"
        ? VERIFICATION_REQUIRED_FIELDS
        : CONVENTION_REQUIRED_FIELDS;

    for (const field of requiredFields) {
      const value = content[field];

      if (value === undefined || value === null) {
        findings.push({
          code: "ENGRAPH_SCHEMA_INVALID",
          severity: "error",
          file: file.relativePath,
          detail: {
            field,
            reason: `Required field "${field}" is missing`,
          },
        });
        continue;
      }

      // Type checks
      if (field === "id" || field === "type" || field === "provenance") {
        if (typeof value !== "string" || value.trim() === "") {
          findings.push({
            code: "ENGRAPH_SCHEMA_INVALID",
            severity: "error",
            file: file.relativePath,
            detail: {
              field,
              reason: `Field "${field}" must be a non-empty string`,
            },
          });
        }
      }

      if (field === "applies_to_modules" || field === "triggered_by_modules") {
        if (!Array.isArray(value)) {
          findings.push({
            code: "ENGRAPH_SCHEMA_INVALID",
            severity: "error",
            file: file.relativePath,
            detail: {
              field,
              reason: `Field "${field}" must be an array of strings`,
            },
          });
        }
      }
    }

    // Validate provenance value
    if (
      typeof content.provenance === "string" &&
      !["manual", "detected", "generated"].includes(content.provenance)
    ) {
      findings.push({
        code: "ENGRAPH_SCHEMA_INVALID",
        severity: "error",
        file: file.relativePath,
        detail: {
          field: "provenance",
          reason: `Field "provenance" must be one of: manual, detected, generated`,
        },
      });
    }
  }

  return findings;
}
