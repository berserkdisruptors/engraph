import path from "path";
import fs from "fs-extra";
import { isSeq } from "yaml";
import type { Finding, ParsedContextFile } from "../types.js";

const GLOB_CHARS = /[*?[]/;

function isGlobPattern(value: string): boolean {
  return GLOB_CHARS.test(value);
}

function isValidGlob(value: string): { valid: boolean; error?: string } {
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

/**
 * Remove items at given indices from both the plain object array and the
 * document AST sequence, preserving formatting in the AST.
 */
function removeFromArray(
  file: ParsedContextFile,
  fieldPath: (string | number)[],
  contentArray: unknown[],
  indices: number[]
): void {
  // Update plain object
  const kept = contentArray.filter((_, i) => !indices.includes(i));
  // Walk to the parent and set the field
  let obj: Record<string, unknown> = file.content;
  for (let i = 0; i < fieldPath.length - 1; i++) {
    obj = obj[fieldPath[i]] as Record<string, unknown>;
  }
  obj[fieldPath[fieldPath.length - 1] as string] = kept;

  // Update document AST
  if (file.document) {
    const seq = file.document.getIn(fieldPath, true);
    if (isSeq(seq)) {
      for (const idx of [...indices].reverse()) {
        seq.items.splice(idx, 1);
      }
    }
  }

  file.modified = true;
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
        removeFromArray(
          file,
          ["reference_files"],
          content.reference_files as unknown[],
          brokenIndices
        );
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
        removeFromArray(
          file,
          ["examples"],
          content.examples as unknown[],
          brokenIndices
        );
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
        removeFromArray(
          file,
          ["known_risks"],
          content.known_risks as unknown[],
          brokenIndices
        );
      }
    }
  }

  return findings;
}
