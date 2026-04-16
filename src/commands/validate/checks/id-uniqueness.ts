import type { Finding, ParsedContextFile } from "../types.js";

export function checkIdUniqueness(files: ParsedContextFile[]): Finding[] {
  const idToFiles = new Map<string, string[]>();

  for (const file of files) {
    const id = file.content.id;
    if (typeof id !== "string" || id.trim() === "") continue;

    const existing = idToFiles.get(id) ?? [];
    existing.push(file.relativePath);
    idToFiles.set(id, existing);
  }

  const findings: Finding[] = [];
  for (const [id, filePaths] of idToFiles) {
    if (filePaths.length > 1) {
      findings.push({
        code: "ENGRAPH_DUPLICATE_ID",
        severity: "error",
        file: filePaths[0],
        detail: {
          id,
          files: filePaths,
        },
      });
    }
  }

  return findings;
}
