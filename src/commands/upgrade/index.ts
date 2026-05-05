import chalk from "chalk";
import { UpgradeOptions } from "../../types.js";
import { TAGLINE, MINT_COLOR, GREEN_COLOR } from "../../constants.js";
import { showBanner, selectMultipleWithCheckboxes } from "../../lib/interactive.js";
import { validateUpgradePrerequisites } from "./validation.js";
import { executeUpgrade } from "./execution.js";
import { detectInstalledAgents } from "../../utils/config.js";
import { AI_CHOICES } from "../../constants.js";

/**
 * Main upgrade command entry point
 * Orchestrates validation, configuration detection, and upgrade execution
 */
export async function upgradeCommand(options: UpgradeOptions): Promise<void> {
  // Show banner
  showBanner("", TAGLINE);

  const {
    ai: aiOverride,
    dryRun = false,
    debug = false,
    githubToken,
    skipTls = false,
    local,
  } = options;

  // Get current working directory (project root)
  const projectPath = process.cwd();

  // Validate prerequisites
  const validation = validateUpgradePrerequisites(projectPath);
  if (!validation.valid) {
    console.log();
    console.log(chalk.red("✗ Upgrade failed:"), validation.error);
    console.log();
    if (validation.suggestion) {
      console.log(MINT_COLOR("Suggestion:"), validation.suggestion);
      console.log();
    }
    process.exit(1);
  }

  // Detect which agents are already installed by checking which skills/ folders exist
  const installedAgents = detectInstalledAgents(projectPath);

  // Determine AI agent(s) (override > prompt with defaults)
  let selectedAi: string[];
  if (aiOverride) {
    // Handle array input from Commander.js variadic option
    const aiArray = Array.isArray(aiOverride) ? aiOverride : [aiOverride];
    // Validate each agent
    for (const ai of aiArray) {
      if (!AI_CHOICES[ai]) {
        console.log();
        console.log(
          chalk.red("✗ Invalid AI agent:"),
          ai
        );
        console.log(MINT_COLOR("Valid options:"), Object.keys(AI_CHOICES).join(", "));
        console.log();
        process.exit(1);
      }
    }

    // Merge with detected installed agents (additive behavior)
    selectedAi = Array.from(new Set([...installedAgents, ...aiArray]));

    console.log(
      MINT_COLOR("AI agent(s) (merged):"),
      selectedAi.join(", ")
    );
  } else {
    // Prompt for AI agent selection with detected agents pre-selected
    if (installedAgents.length > 0) {
      console.log(
        MINT_COLOR(
          `Modify your AI agent(s) (current: ${installedAgents.join(", ")}):`
        )
      );
    } else {
      console.log(
        MINT_COLOR(
          "No AI agent installed. Please select one or more:"
        )
      );
    }

    selectedAi = await selectMultipleWithCheckboxes(
      AI_CHOICES,
      "Choose your AI agent(s) (use spacebar to select, enter to confirm):",
      installedAgents
    );
  }

  console.log();

  // Execute upgrade
  try {
    await executeUpgrade(projectPath, selectedAi, {
      dryRun,
      debug,
      githubToken,
      skipTls,
      local,
    });

    console.log();
    console.log(GREEN_COLOR.bold("✓ Upgrade complete!"));
    console.log();
  } catch (e: any) {
    console.log();
    console.log(chalk.red("✗ Upgrade failed:"), e.message);
    if (debug && e.stack) {
      console.log();
      console.log(chalk.gray(e.stack));
    }
    console.log();
    process.exit(1);
  }
}
