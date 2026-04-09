import { lookupModules, type LookupResult, type LookupOptions } from "../lookup/index.js";
import { recallModules, type RecallResult, type RecallOptions } from "../recall/index.js";

export interface SearchResult {
  query_modules: string[];
  lookup: Omit<LookupResult, "query_modules">;
  recall: Omit<RecallResult, "query_modules">;
}

export interface SearchOptions {
  debug?: boolean;
  filter?: string[];
  limit?: number;
}

/**
 * Unified search: runs lookup and recall in parallel, merges output.
 *
 * This is the primary command skills invoke to get all Engraph context
 * for a set of module IDs in a single call.
 */
export async function searchModules(
  projectPath: string,
  moduleInputs: string[],
  options: SearchOptions = {}
): Promise<SearchResult> {
  const { debug = false, filter, limit } = options;

  const lookupOpts: LookupOptions = { debug };
  const recallOpts: RecallOptions = { debug, filter, limit };

  const [lookupResult, recallResult] = await Promise.all([
    lookupModules(projectPath, moduleInputs, lookupOpts),
    recallModules(projectPath, moduleInputs, recallOpts),
  ]);

  return {
    query_modules: lookupResult.query_modules,
    lookup: {
      conventions: lookupResult.conventions,
      verification: lookupResult.verification,
      global_conventions: lookupResult.global_conventions,
    },
    recall: {
      commits: recallResult.commits,
    },
  };
}
