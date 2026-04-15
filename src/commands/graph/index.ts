import path from "path";
import { createHash } from "crypto";
import fs from "fs-extra";
import type { Codegraph } from "./types.js";
import { scanModules, listAllTrackedFiles, detectSourceRoots } from "./scanner.js";
import { analyzeImports } from "./analyzer.js";
import { detectProjectProfile } from "./profiler.js";
import { writeCodegraph } from "./serializer.js";
import { regenerateContextIndex } from "./context-index.js";
import { computeConsistencyReport } from "./consistency.js";
import type { ConsistencyReport } from "./consistency.js";


const GENERATOR_VERSION = "1.0.0";

export interface GenerateCodegraphOptions {
  debug?: boolean;
  consistencyReport?: boolean;
}

export interface GenerateCodegraphResult {
  codegraph: Codegraph;
  consistencyReport?: ConsistencyReport;
}

/**
 * Generate the codegraph for a project and write it to `.engraph/codegraph/`.
 *
 * This is the main entry point called by `init` and `upgrade` commands.
 * The codegraph is a deterministic, auto-generated structural representation
 * of the codebase — no LLM calls, runs in seconds.
 */
export async function generateCodegraph(
  projectPath: string,
  options: GenerateCodegraphOptions = {}
): Promise<GenerateCodegraphResult> {
  const { debug = false, consistencyReport: wantReport = false } = options;

  // Resolve the commit SHA from git (if available)
  const commitSha = await resolveCommitSha(projectPath);

  if (debug) {
    console.log(`[codegraph] project path: ${projectPath}`);
    console.log(`[codegraph] commit: ${commitSha ?? "none"}`);
  }

  // WP2 — Layer 1: Directory scanner + module tree
  const modules = await scanModules(projectPath, { debug });

  // WP3 — Layer 2: Project profile + entry point detection
  const allFiles = await listAllTrackedFiles(projectPath);
  const project = await detectProjectProfile(projectPath, allFiles, modules, { debug });

  // WP4 — Layer 3: Import analysis via tree-sitter WASM
  const sourceRoots = await detectSourceRoots(projectPath);
  const fileImportMap = await analyzeImports(projectPath, modules, sourceRoots, { debug });

  const codegraph: Codegraph = {
    generated_at: new Date().toISOString(),
    generator_version: GENERATOR_VERSION,
    commit_sha: commitSha,

    project,
    modules,
  };

  // Write the codegraph to .engraph/codegraph/index.yaml (+ recursive sub-graphs)
  await writeCodegraph(projectPath, codegraph);

  if (debug) {
    console.log(`[codegraph] written to .engraph/codegraph/index.yaml`);
  }

  // Regenerate context index (.engraph/context/_index.yaml)
  const codegraphIndexPath = path.join(projectPath, ".engraph", "codegraph", "index.yaml");
  const codegraphContent = await fs.readFile(codegraphIndexPath, "utf8");
  const codegraphHash = createHash("sha256").update(codegraphContent).digest("hex").slice(0, 12);

  await regenerateContextIndex(projectPath, codegraphHash, { debug });

  // Compute consistency report if requested
  let report: ConsistencyReport | undefined;
  if (wantReport) {
    report = await computeConsistencyReport(
      projectPath,
      codegraph.modules,
      codegraph.project,
      fileImportMap
    );

    if (debug) {
      console.log(`[codegraph] consistency report computed`);
    }
  }

  return { codegraph, consistencyReport: report };
}

/**
 * Resolve the current git HEAD commit SHA, or null if not a git repo.
 */
async function resolveCommitSha(
  projectPath: string
): Promise<string | null> {
  try {
    const { execSync } = await import("child_process");
    const sha = execSync("git rev-parse HEAD", {
      cwd: projectPath,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return sha || null;
  } catch {
    return null;
  }
}
