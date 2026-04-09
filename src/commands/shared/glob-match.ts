/**
 * Simple glob matching for bridge field patterns.
 *
 * Supports:
 *   - Exact match: "auth/providers"
 *   - Single-level wildcard: "auth/*" (direct children of auth)
 *   - Global wildcard: "*" (matches everything)
 *
 * No "**" recursive pattern.
 */
export function matchModuleGlob(moduleId: string, pattern: string): boolean {
  // Global wildcard
  if (pattern === "*") {
    return true;
  }

  // Exact match
  if (!pattern.includes("*")) {
    return moduleId === pattern;
  }

  // Single-level wildcard: "auth/*" matches "auth/providers" but not "auth/providers/google"
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2); // strip "/*"
    if (!moduleId.startsWith(prefix + "/")) {
      return false;
    }
    // Check there's no further "/" after the prefix
    const rest = moduleId.slice(prefix.length + 1);
    return !rest.includes("/");
  }

  return false;
}
