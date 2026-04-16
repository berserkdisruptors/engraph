import path from "path";
import fs from "fs-extra";
import { parse } from "yaml";
import { buildAliasMap } from "../shared/alias-resolver.js";
import { checkCodegraphExists } from "./checks/codegraph-exists.js";
import { checkSchemaValidity } from "./checks/schema-validity.js";
import { checkIdUniqueness } from "./checks/id-uniqueness.js";
import { checkBridgeReferences } from "./checks/bridge-references.js";
import { checkFilePaths } from "./checks/file-paths.js";
import { checkOrphanedFiles } from "./checks/orphaned-files.js";
import { formatResult, getExitCode } from "./formatter.js";
import type {
  Finding,
  ValidateOptions,
  ValidateResult,
  ParsedContextFile,
} from "./types.js";

export type { ValidateResult, ValidateOptions };

/**
 * Validate structural integrity of convention and verification files
 * against the current codegraph.
 */
export async function validateCommand(
  projectPath: string,
  options: ValidateOptions = {}
): Promise<{ result: ValidateResult; exitCode: number }> {
  const codegraphPath = path.join(
    projectPath,
    ".engraph",
    "codegraph",
    "index.yaml"
  );
  const contextDir = path.join(projectPath, ".engraph", "context");

  // Precondition: codegraph must exist
  const codegraphFindings = await checkCodegraphExists(codegraphPath);
  if (codegraphFindings.length > 0) {
    const result = formatResult(codegraphFindings, codegraphPath, 0);
    return { result, exitCode: getExitCode(result) };
  }

  // Load all context files
  const contextFiles = await loadContextFiles(contextDir);

  // Build alias map from codegraph
  const aliasMap = await buildAliasMap(projectPath);

  // Run all checks
  const findings: Finding[] = [];

  findings.push(...checkSchemaValidity(contextFiles));
  findings.push(...checkIdUniqueness(contextFiles));
  findings.push(...checkBridgeReferences(contextFiles, aliasMap));
  findings.push(...(await checkFilePaths(contextFiles, projectPath)));
  findings.push(...checkOrphanedFiles(contextFiles, aliasMap));

  const result = formatResult(findings, codegraphPath, contextFiles.length);
  return { result, exitCode: getExitCode(result) };
}

async function loadContextFiles(
  contextDir: string
): Promise<ParsedContextFile[]> {
  const files: ParsedContextFile[] = [];

  for (const domain of ["conventions", "verification"]) {
    const domainDir = path.join(contextDir, domain);
    if (!(await fs.pathExists(domainDir))) continue;

    const entries = await fs.readdir(domainDir);
    for (const entry of entries) {
      // Skip schema and index files
      if (entry.startsWith("_")) continue;
      if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;

      const filePath = path.join(domainDir, entry);
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const content = parse(raw);
        if (content && typeof content === "object") {
          files.push({
            filePath,
            relativePath: `${domain}/${entry}`,
            content,
          });
        }
      } catch {
        // Skip unparseable files
      }
    }
  }

  return files;
}
