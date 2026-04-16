import path from "path";
import fs from "fs-extra";
import type { Finding, ParsedContextFile } from "../types.js";

const GLOB_CHARS = /[*?[]/;

function isGlobPattern(value: string): boolean {
  return GLOB_CHARS.test(value);
}

function isValidGlob(value: string): { valid: boolean; error?: string } {
  // Check for unmatched brackets
  let inBracket = false;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "[" && !inBracket) {
      inBracket = true;
    } else if (value[i] === "]" && inBracket) {
      inBracket = false;
    }
  }
  if (inBracket) {
    return { valid: false, error: "Unmatched '[' in glob pattern" };
  }
  return { valid: true };
}

export async function checkFilePaths(
  files: ParsedContextFile[],
  projectPath: string,
  fix = false
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const file of files) {
    const content = file.content;

    // Check reference_files (conventions)
    if (Array.isArray(content.reference_files)) {
      const brokenIndices: number[] = [];
      for (let i = 0; i < content.reference_files.length; i++) {
        const filePath = content.reference_files[i];
        if (typeof filePath !== "string") continue;

        const resolved = path.resolve(projectPath, filePath);
        if (!(await fs.pathExists(resolved))) {
          if (fix) {
            brokenIndices.push(i);
            findings.push({
              code: "ENGRAPH_FILE_PATH_REMOVED",
              severity: "info",
              file: file.relativePath,
              detail: {
                field: `reference_files[${i}]`,
                removed: filePath,
                reason: "File path removed by --fix",
              },
            });
          } else {
            findings.push({
              code: "ENGRAPH_UNRESOLVABLE_FILE_PATH",
              severity: "warning",
              file: file.relativePath,
              detail: {
                field: `reference_files[${i}]`,
                value: filePath,
                reason: "File does not exist",
              },
            });
          }
        }
      }
      if (fix && brokenIndices.length > 0) {
        content.reference_files = (content.reference_files as string[]).filter(
          (_, i) => !brokenIndices.includes(i)
        );
        file.modified = true;
      }
    }

    // Check examples[].file (conventions)
    if (Array.isArray(content.examples)) {
      const brokenIndices: number[] = [];
      for (let i = 0; i < content.examples.length; i++) {
        const example = content.examples[i];
        if (!example || typeof example.file !== "string") continue;

        const resolved = path.resolve(projectPath, example.file);
        if (!(await fs.pathExists(resolved))) {
          if (fix) {
            brokenIndices.push(i);
            findings.push({
              code: "ENGRAPH_FILE_PATH_REMOVED",
              severity: "info",
              file: file.relativePath,
              detail: {
                field: `examples[${i}].file`,
                removed: example.file,
                reason: "Example removed by --fix (file path broken)",
              },
            });
          } else {
            findings.push({
              code: "ENGRAPH_UNRESOLVABLE_FILE_PATH",
              severity: "warning",
              file: file.relativePath,
              detail: {
                field: `examples[${i}].file`,
                value: example.file,
                reason: "File does not exist",
              },
            });
          }
        }
      }
      if (fix && brokenIndices.length > 0) {
        content.examples = (content.examples as unknown[]).filter(
          (_, i) => !brokenIndices.includes(i)
        );
        file.modified = true;
      }
    }

    // Check known_risks[].module (verifications)
    if (Array.isArray(content.known_risks)) {
      const brokenIndices: number[] = [];
      for (let i = 0; i < content.known_risks.length; i++) {
        const risk = content.known_risks[i];
        if (!risk || typeof risk.module !== "string") continue;

        const modulePath = risk.module;

        if (isGlobPattern(modulePath)) {
          // Glob: syntax check only — no fix
          const result = isValidGlob(modulePath);
          if (!result.valid) {
            findings.push({
              code: "ENGRAPH_INVALID_GLOB_SYNTAX",
              severity: "warning",
              file: file.relativePath,
              detail: {
                field: `known_risks[${i}].module`,
                value: modulePath,
                parse_error: result.error!,
              },
            });
          }
        } else {
          // Literal path: filesystem check
          const resolved = path.resolve(projectPath, modulePath);
          if (!(await fs.pathExists(resolved))) {
            if (fix) {
              brokenIndices.push(i);
              findings.push({
                code: "ENGRAPH_FILE_PATH_REMOVED",
                severity: "info",
                file: file.relativePath,
                detail: {
                  field: `known_risks[${i}].module`,
                  removed: modulePath,
                  reason: "Known risk entry removed by --fix (file path broken)",
                },
              });
            } else {
              findings.push({
                code: "ENGRAPH_UNRESOLVABLE_FILE_PATH",
                severity: "warning",
                file: file.relativePath,
                detail: {
                  field: `known_risks[${i}].module`,
                  value: modulePath,
                  reason: "File does not exist",
                },
              });
            }
          }
        }
      }
      if (fix && brokenIndices.length > 0) {
        content.known_risks = (content.known_risks as unknown[]).filter(
          (_, i) => !brokenIndices.includes(i)
        );
        file.modified = true;
      }
    }
  }

  return findings;
}
