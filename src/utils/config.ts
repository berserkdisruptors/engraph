import fs from "fs-extra";
import path from "path";
import { EngraphConfig } from "../types.js";
import { AGENT_FOLDER_MAP, ENGRAPH_SKILL_NAMES } from "../config/agents.js";

/**
 * Get the default Engraph configuration
 */
export function getDefaultConfig(): EngraphConfig {
  return {
    aliases: {
      "engraph/context/conventions": "conventions",
      "engraph/context/verifications": "verifications",
    },
  };
}

/**
 * Create a engraph.json config file content
 * @param version - Optional CLI version
 */
export function createConfigContent(version?: string): string {
  const config: EngraphConfig = {
    ...getDefaultConfig(),
    ...(version && { version }),
  };
  return JSON.stringify(config, null, 2) + "\n";
}

/**
 * Detect which AI agents have engraph skills installed by checking for the
 * presence of at least one known engraph skill directory inside the agent's
 * skills/ folder. A skills/ folder alone is not enough — it must contain at
 * least one engraph skill to be considered an engraph installation.
 * @param projectPath - Path to the project directory
 * @returns Array of agent keys (e.g. ["universal", "claude"]) with engraph installed
 */
export function detectInstalledAgents(projectPath: string): string[] {
  return Object.entries(AGENT_FOLDER_MAP)
    .filter(([, folder]) => {
      const skillsDir = path.join(projectPath, folder, "skills");
      return ENGRAPH_SKILL_NAMES.some((skill) =>
        fs.existsSync(path.join(skillsDir, skill))
      );
    })
    .map(([agent]) => agent);
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

  // Clean up deprecated fields from old configs
  if ('aiAssistants' in mergedConfig) {
    delete (mergedConfig as any).aiAssistants;
  }
  if ('framework' in mergedConfig) {
    delete (mergedConfig as any).framework;
  }

  // Write back to file
  fs.writeFileSync(
    configPath,
    JSON.stringify(mergedConfig, null, 2) + "\n",
    "utf-8"
  );
}
