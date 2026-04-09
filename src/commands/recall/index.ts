import path from "path";
import { execSync } from "child_process";
import { buildAliasMap, resolveModuleInputs } from "../shared/alias-resolver.js";

export interface RecallCommit {
  hash: string;
  date: string;
  subject: string;
  actions: Record<string, string[]>;
}

export interface RecallResult {
  query_modules: string[];
  commits: RecallCommit[];
}

export interface RecallOptions {
  debug?: boolean;
  filter?: string[];
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const ACTION_LINE_RE = /^(intent|decision|rejected|constraint|learned)\(([^)]+)\):\s*(.+)$/;

/**
 * Search git history for contextual commit action lines scoped to given modules.
 *
 * Resolves module inputs to aliases (contextual commits use aliases as scopes,
 * with "/" converted to "-"), then searches git log for matching commits.
 */
export async function recallModules(
  projectPath: string,
  moduleInputs: string[],
  options: RecallOptions = {}
): Promise<RecallResult> {
  const { debug = false, filter, limit = DEFAULT_LIMIT } = options;

  const aliasMap = await buildAliasMap(projectPath);
  const resolvedModules = resolveModuleInputs(moduleInputs, aliasMap);

  // Build the set of search terms — use aliases when available since
  // contextual commits use aliases as scopes (with / → -)
  const searchTerms = new Set<string>();
  for (const moduleId of resolvedModules) {
    // Add alias form (preferred in commits)
    const alias = aliasMap.moduleIdToAlias.get(moduleId);
    if (alias) {
      searchTerms.add(alias);
    }
    // Also add the dash-converted module ID form
    searchTerms.add(moduleId.replace(/\//g, "-"));
  }

  if (debug) {
    console.log(`[recall] query modules: ${resolvedModules.join(", ")}`);
    console.log(`[recall] search terms: ${[...searchTerms].join(", ")}`);
  }

  // Search git log for each term
  const commitMap = new Map<string, RecallCommit>();

  for (const term of searchTerms) {
    const commits = searchGitLog(projectPath, term, limit, debug);
    for (const commit of commits) {
      if (!commitMap.has(commit.hash)) {
        commitMap.set(commit.hash, commit);
      } else {
        // Merge actions from duplicate matches
        const existing = commitMap.get(commit.hash)!;
        for (const [type, lines] of Object.entries(commit.actions)) {
          if (!existing.actions[type]) {
            existing.actions[type] = [];
          }
          for (const line of lines) {
            if (!existing.actions[type].includes(line)) {
              existing.actions[type].push(line);
            }
          }
        }
      }
    }
  }

  // Sort by date descending
  let commits = [...commitMap.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Apply action type filter
  if (filter && filter.length > 0) {
    commits = commits
      .map((commit) => {
        const filteredActions: Record<string, string[]> = {};
        for (const type of filter) {
          if (commit.actions[type]) {
            filteredActions[type] = commit.actions[type];
          }
        }
        return { ...commit, actions: filteredActions };
      })
      .filter((commit) => Object.keys(commit.actions).length > 0);
  }

  if (debug) {
    console.log(`[recall] found ${commits.length} commits`);
  }

  return {
    query_modules: resolvedModules,
    commits,
  };
}

/**
 * Search git log for commits mentioning a scope term in action lines.
 */
function searchGitLog(
  projectPath: string,
  term: string,
  limit: number,
  debug: boolean
): RecallCommit[] {
  try {
    // Search for the term appearing in parentheses (scope position in action lines)
    const output = execSync(
      `git log --all --max-count=${limit} --grep="(${term})" --format="%H|%aI|%s%n%b%n---END---"`,
      {
        cwd: projectPath,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    return parseGitLogOutput(output, term);
  } catch (err) {
    if (debug) {
      console.log(`[recall] git log failed for term "${term}": ${err}`);
    }
    return [];
  }
}

/**
 * Parse git log output into structured commits with action lines.
 */
function parseGitLogOutput(output: string, searchTerm: string): RecallCommit[] {
  const commits: RecallCommit[] = [];
  const blocks = output.split("---END---").filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;

    // First line is: hash|date|subject
    const headerLine = lines[0];
    const pipeIdx1 = headerLine.indexOf("|");
    const pipeIdx2 = headerLine.indexOf("|", pipeIdx1 + 1);
    if (pipeIdx1 === -1 || pipeIdx2 === -1) continue;

    const hash = headerLine.slice(0, pipeIdx1);
    const date = headerLine.slice(pipeIdx1 + 1, pipeIdx2);
    const subject = headerLine.slice(pipeIdx2 + 1);

    // Rest of lines are the body — parse action lines
    const actions: Record<string, string[]> = {};

    for (let i = 1; i < lines.length; i++) {
      const match = lines[i].trim().match(ACTION_LINE_RE);
      if (match) {
        const [, actionType, scope, description] = match;
        // Only include action lines that match our search term
        if (scope === searchTerm) {
          if (!actions[actionType]) {
            actions[actionType] = [];
          }
          actions[actionType].push(description);
        }
      }
    }

    // Only include commits that have matching action lines
    if (Object.keys(actions).length > 0) {
      commits.push({ hash: hash.slice(0, 12), date: date.split("T")[0], subject, actions });
    }
  }

  return commits;
}
