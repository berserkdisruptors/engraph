import chalk from "chalk";
import { showBanner } from "../lib/interactive.js";
import { TAGLINE, GREEN_COLOR } from "../constants.js";
import { checkTool } from "../utils/index.js";
import { StepTracker } from "../lib/step-tracker.js";
import { detectInstalledAgents } from "../utils/config.js";

/** Folder agents that have a representative CLI binary worth checking */
const AGENT_TOOL_MAP: Record<string, string> = {
  claude: "claude",
  pi: "pi",
};

function checkToolForTracker(tool: string, tracker: StepTracker): boolean {
  if (checkTool(tool)) {
    tracker.complete(tool, "available");
    return true;
  } else {
    tracker.error(tool, "not found");
    return false;
  }
}

export function checkCommand(): void {
  showBanner("", TAGLINE);
  console.log(chalk.bold("Checking for installed tools..."));
  console.log();

  const tracker = new StepTracker("Check Available Tools");
  const installedAgents = detectInstalledAgents(process.cwd());
  const agentsToCheck = installedAgents.filter((a) => a in AGENT_TOOL_MAP);

  tracker.add("git", "Git version control");
  for (const agent of agentsToCheck) {
    tracker.add(AGENT_TOOL_MAP[agent], `${agent} CLI`);
  }

  const gitOk = checkToolForTracker("git", tracker);
  const agentResults = agentsToCheck.map((agent) =>
    checkToolForTracker(AGENT_TOOL_MAP[agent], tracker)
  );

  console.log(tracker.render());
  console.log();

  console.log(GREEN_COLOR.bold("Engraph is ready to use!"));
  console.log();

  if (!gitOk) {
    console.log(chalk.dim("Tip: Install git for repository management"));
  }

  if (!agentResults.some(Boolean)) {
    console.log(
      chalk.dim("Tip: Install an agent for the best experience")
    );
  }
}
