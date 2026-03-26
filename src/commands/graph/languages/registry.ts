/**
 * Extension → LanguageExtractor registry.
 *
 * Extractors are lazily loaded via dynamic imports so only the grammars
 * for detected languages are ever instantiated.
 */

import type { LanguageExtractor } from "./types.js";

type ExtractorFactory = () => Promise<LanguageExtractor>;

/**
 * Map of file extensions to extractor factory functions.
 * Currently supports TypeScript and JavaScript. Additional languages
 * will be added in subsequent work packages (WP4b-d).
 */
const EXTRACTOR_MAP: Record<string, ExtractorFactory> = {
  // TypeScript
  ".ts": () => import("./typescript.js").then((m) => m.typescriptExtractor),
  ".tsx": () => import("./typescript.js").then((m) => m.tsxExtractor),
  // JavaScript
  ".js": () => import("./javascript.js").then((m) => m.javascriptExtractor),
  ".jsx": () => import("./javascript.js").then((m) => m.javascriptExtractor),
  ".mjs": () => import("./javascript.js").then((m) => m.javascriptExtractor),
  ".cjs": () => import("./javascript.js").then((m) => m.javascriptExtractor),
};

/** Cache: extension → extractor instance (already loaded) */
const loadedExtractors = new Map<string, LanguageExtractor>();

/**
 * Get the extractor for a file extension. Returns null if unsupported.
 * Caches loaded extractors so each is only imported once.
 */
export async function getExtractor(
  ext: string
): Promise<LanguageExtractor | null> {
  const cached = loadedExtractors.get(ext);
  if (cached) return cached;

  const factory = EXTRACTOR_MAP[ext];
  if (!factory) return null;

  const extractor = await factory();
  loadedExtractors.set(ext, extractor);
  return extractor;
}

/** Get all registered extensions */
export function getRegisteredExtensions(): string[] {
  return Object.keys(EXTRACTOR_MAP);
}

/** Reset the cache (for testing) */
export function resetExtractorCache(): void {
  loadedExtractors.clear();
}
