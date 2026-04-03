import { execSync } from "child_process";
import { statSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import chalk from "chalk";
import { MINT_COLOR, GREEN_COLOR } from "../constants.js";

/**
 * Check if a directory is inside a git repository
 */
export function isGitRepo(path?: string): boolean {
  const targetPath = path || process.cwd();

  try {
    const stats = statSync(targetPath);
    if (!stats.isDirectory()) {
      return false;
    }
  } catch (e) {
    return false;
  }

  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: targetPath,
      stdio: "pipe",
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Entries that engraph auto-generates and should never be version controlled.
 * Used by both init and upgrade flows to keep .gitignore in sync.
 */
const ENGRAPH_GITIGNORE_ENTRIES = [
  ".engraph/engraph.json",
  ".engraph/_codegraph.yaml",
];

/**
 * Ensure engraph generated files are listed in .gitignore.
 * Returns true if the file was modified.
 */
export function ensureGitignoreEntries(
  projectPath: string,
  options: { debug?: boolean } = {}
): boolean {
  const gitignorePath = path.join(projectPath, ".gitignore");
  if (!existsSync(gitignorePath)) return false;

  let content = readFileSync(gitignorePath, "utf8");
  let modified = false;

  for (const entry of ENGRAPH_GITIGNORE_ENTRIES) {
    if (!content.includes(entry)) {
      content = content.trimEnd() + "\n" + entry + "\n";
      modified = true;

      if (options.debug) {
        console.log(chalk.gray(`\nUpdated .gitignore: added ${entry}`));
      }
    }
  }

  if (modified) {
    writeFileSync(gitignorePath, content, "utf8");
  }

  return modified;
}

/**
 * Initialize a git repository
 */
export function initGitRepo(
  projectPath: string,
  quiet: boolean = false
): boolean {
  try {
    const originalCwd = process.cwd();
    process.chdir(projectPath);

    if (!quiet) {
      console.log(MINT_COLOR("Initializing git repository..."));
    }

    execSync("git init", { stdio: quiet ? "pipe" : "inherit" });
    execSync("git add .", { stdio: "pipe" });
    execSync('git commit -m "Initial commit from Engraph template"', {
      stdio: "pipe",
    });

    if (!quiet) {
      console.log(GREEN_COLOR("✓") + " Git repository initialized");
    }

    process.chdir(originalCwd);
    return true;
  } catch (e) {
    if (!quiet) {
      console.error(chalk.red("Error initializing git repository:"), e);
    }
    return false;
  }
}
