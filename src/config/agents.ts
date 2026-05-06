import { AIChoice } from "../types.js";

export const AI_CHOICES: AIChoice = {
  universal: "Amp, Antigravity, Cline, Codex, Cursor, Deep Agents, Dexto, Firebender, Gemini CLI, GitHub Copilot, Kimi Code CLI, OpenCode, Warp",
  claude: "Claude Code",
  pi: "Pi",
};

export const AGENT_FOLDER_MAP: Record<string, string> = {
  universal: ".agents/",
  claude: ".claude/",
  pi: ".pi/",
};

export const ENGRAPH_SKILL_NAMES: string[] = [
  "context-search",
  "context-commit",
  "context-verify",
  "context-extract",
  "context-add",
];
