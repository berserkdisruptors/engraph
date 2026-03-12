import fs from "fs-extra";
import path from "path";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

/**
 * Validate prerequisites for upgrade command
 * - .engraph/engraph.json must exist
 * - .engraph/ directory must exist
 * - engraph.json must be valid JSON
 */
export function validateUpgradePrerequisites(
  projectPath: string
): ValidationResult {
  // Check if .engraph/ directory exists
  const engraphDir = path.join(projectPath, ".engraph");
  if (!fs.existsSync(engraphDir)) {
    return {
      valid: false,
      error: ".engraph/ directory not found",
      suggestion:
        "This doesn't appear to be a Engraph project. Run 'engraph init .' to initialize.",
    };
  }

  // Check if engraph.json exists
  const configPath = path.join(projectPath, ".engraph", "engraph.json");
  if (!fs.existsSync(configPath)) {
    return {
      valid: false,
      error: ".engraph/engraph.json not found",
      suggestion:
        "Configuration file is missing. Run 'engraph init .' to reinitialize this directory.",
    };
  }

  // Check if engraph.json is valid JSON
  try {
    const configContent = fs.readFileSync(configPath, "utf-8");
    JSON.parse(configContent);
  } catch (e) {
    return {
      valid: false,
      error: ".engraph/engraph.json is not valid JSON",
      suggestion:
        "Check the file for syntax errors or restore from git history.",
    };
  }

  return { valid: true };
}
