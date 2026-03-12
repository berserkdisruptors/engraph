import fs from "fs-extra";
import path from "path";
import { EngraphConfig } from "../types.js";

/**
 * Get the default Engraph configuration
 */
export function getDefaultConfig(): EngraphConfig {
  return {
    framework: "engraph",
  };
}

/**
 * Create a engraph.json config file content
 * @param aiAssistants - Optional AI agent names array
 * @param version - Optional CLI version
 */
export function createConfigContent(
  aiAssistants?: string[],
  version?: string
): string {
  const config: EngraphConfig = {
    ...getDefaultConfig(),
    ...(aiAssistants && { aiAssistants }),
    ...(version && { version }),
  };
  return JSON.stringify(config, null, 2) + "\n";
}

/**
 * Read engraph.json configuration file
 * @param projectPath - Path to the project directory
 * @returns Parsed configuration or null if file doesn't exist or is malformed
 */
export function readEngraphConfig(
  projectPath: string
): EngraphConfig | null {
  const configPath = path.join(projectPath, ".engraph", "engraph.json");

  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent) as EngraphConfig;
    return config;
  } catch (error) {
    // Return null for malformed JSON or read errors
    return null;
  }
}

/**
 * Save engraph.json configuration file
 * Merges new fields with existing config to preserve other settings
 * @param projectPath - Path to the project directory
 * @param updates - Partial configuration to merge
 */
export function saveEngraphConfig(
  projectPath: string,
  updates: Partial<EngraphConfig>
): void {
  const configPath = path.join(projectPath, ".engraph", "engraph.json");

  // Read existing config or use default
  let existingConfig: EngraphConfig;
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      existingConfig = JSON.parse(content);
    } else {
      existingConfig = getDefaultConfig();
    }
  } catch {
    existingConfig = getDefaultConfig();
  }

  // Merge updates with existing config
  const mergedConfig = {
    ...existingConfig,
    ...updates,
  };

  // Write back to file
  fs.writeFileSync(
    configPath,
    JSON.stringify(mergedConfig, null, 2) + "\n",
    "utf-8"
  );
}
