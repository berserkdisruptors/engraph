#!/usr/bin/env node

import path from "path";
import fs from "fs-extra";
import { Command } from "commander";
import chalk from "chalk";
import { initCommand } from "./commands/init/index.js";
import { upgradeCommand } from "./commands/upgrade/index.js";
import { checkCommand } from "./commands/check.js";
import { generateCodegraph } from "./commands/graph/index.js";
import { lookupModules } from "./commands/lookup/index.js";
import { recallModules } from "./commands/recall/index.js";
import { searchModules } from "./commands/search/index.js";
import { validateCommand } from "./commands/validate/index.js";
import { generateBanner } from "./lib/interactive.js";
import { MINT_COLOR, TAGLINE } from "./constants.js";
import { createBox } from "./utils/box.js";
import { getPackageVersion } from "./utils/package-info.js";
import { hardWrap, formatKeyValueRows } from "./utils/text-format.js";

const program = new Command();

program
  .name("engraph")
  .usage("[command] [options]")
  .description(TAGLINE)
  .version(getPackageVersion())
  .enablePositionalOptions();

// --- Custom help formatting -------------------------------------------------
// Green color for option/argument/command terms
const mint = MINT_COLOR;

// Put banner above Commander help (usage, options, commands)
// Pass function reference so it's called when help is displayed (not at module load)
const renderBannerForHelp = () => {
  return generateBanner();
};
program.addHelpText("beforeAll", renderBannerForHelp);

program.configureHelp({
  optionTerm(option) {
    return mint(option.flags);
  },
  argumentTerm(argument) {
    // argument.name() may be undefined in some commander versions; fallback to displayName
    const name =
      (argument as any).name?.() ?? (argument as any).displayName ?? "<arg>";
    return mint(name);
  },
  subcommandTerm(cmd) {
    return mint(cmd.name());
  },
  formatHelp(cmd, helper) {
    const termWidth = helper.longestOptionTermLength(cmd, helper);
    const helpWidth = helper.helpWidth ?? (process.stdout.columns || 80);
    const wrap = (str: string) =>
      helper.wrap(str, helpWidth - termWidth - 4, termWidth + 4);

    const lines: string[] = [];

    // Usage - box it like other sections
    const usageText = helper.commandUsage(cmd);
    const boxMaxWidth = 70;
    const fixedInner = Math.min(boxMaxWidth, Math.max(20, helpWidth - 2));
    lines.push(
      "\n" + createBox(usageText, { title: "Usage", width: fixedInner })
    );

    // Commands
    const subcommands = helper.visibleCommands(cmd);
    if (subcommands.length) {
      const rows = subcommands.map((c) => ({
        term: helper.subcommandTerm(c),
        desc: helper.subcommandDescription(c),
      }));
      const cmdLines = formatKeyValueRows(rows, termWidth, helpWidth);
      // Smaller box width - max 70 chars for content
      const boxMaxWidth = 70;
      const fixedInner = Math.min(boxMaxWidth, Math.max(20, helpWidth - 2));
      lines.push(
        "\n" + createBox(cmdLines, { title: "Commands", width: fixedInner })
      );
    }

    // Options
    const options = helper.visibleOptions(cmd);
    if (options.length) {
      const rows = options.map((opt) => ({
        term: helper.optionTerm(opt),
        desc: helper.optionDescription(opt),
      }));
      const optLines = formatKeyValueRows(rows, termWidth, helpWidth);
      // Smaller box width - max 70 chars for content
      const boxMaxWidth = 70;
      const fixedInner = Math.min(boxMaxWidth, Math.max(20, helpWidth - 2));
      lines.push(
        "\n" + createBox(optLines, { title: "Options", width: fixedInner })
      );
    }

    // Arguments
    const argumentsList = helper.visibleArguments(cmd);
    if (argumentsList.length) {
      const rows = argumentsList.map((arg) => ({
        term: helper.argumentTerm(arg),
        desc: helper.argumentDescription(arg),
      }));
      const argLines = formatKeyValueRows(rows, termWidth, helpWidth);
      // Smaller box width - max 70 chars for content
      const boxMaxWidth = 70;
      const fixedInner = Math.min(boxMaxWidth, Math.max(20, helpWidth - 2));
      lines.push(
        "\n" + createBox(argLines, { title: "Arguments", width: fixedInner })
      );
    }

    return lines.join("\n") + "\n";
  },
});

// Init command
program
  .command("init", { isDefault: true })
  .description("Initialize Engraph and slash commands")
  .argument(
    "[project-name]",
    'Name for your new project directory (optional if using --here, or use "." for current directory)'
  )
  .option(
    "--ai <agent...>",
    "AI agent(s) to use (can specify multiple): universal, claude, or pi"
  )
  .option(
    "--ignore-agent-tools",
    "Skip checks for AI agent tools like Claude Code"
  )
  .option("--no-git", "Skip git repository initialization")
  .option(
    "--here",
    "Initialize project in the current directory instead of creating a new one"
  )
  .option(
    "--force",
    "Force merge/overwrite when using --here (skip confirmation)"
  )
  .option("--skip-tls", "Skip SSL/TLS verification (not recommended)")
  .option(
    "--debug",
    "Show verbose diagnostic output for network and extraction failures"
  )
  .option(
    "--github-token <token>",
    "GitHub token to use for API requests (or set GH_TOKEN or GITHUB_TOKEN environment variable)"
  )
  .option(
    "--local [path]",
    "Use local artifacts from directory instead of GitHub (default: .genreleases)\n" +
      "Example: engraph init my-project --local --ai claude"
  )
  .action(async (projectName, options) => {
    // If no project name and no flags, show help
    if (!projectName && !options.here && Object.keys(options).length === 0) {
      // Banner is already registered via program.addHelpText("beforeAll", renderBannerForHelp())
      // so program.help() will display it automatically
      program.help();
      return;
    }

    await initCommand({
      projectName,
      aiAssistant: options.ai,
      ignoreAgentTools: options.ignoreAgentTools,
      noGit: !options.git,
      here: options.here,
      force: options.force,
      skipTls: options.skipTls,
      debug: options.debug,
      githubToken: options.githubToken,
      local: options.local,
    });
  });

program
  .command("upgrade")
  .description(
    "Upgrade project templates, commands, and scripts to the latest version"
  )
  .option(
    "--ai <agent...>",
    "Override or add AI agent(s) (can specify multiple): universal, claude, or pi"
  )
  .option("--dry-run", "Preview changes without applying them")
  .option("--debug", "Show verbose diagnostic output")
  .option("--github-token <token>", "GitHub token for API requests")
  .option("--skip-tls", "Skip SSL/TLS verification (not recommended)")
  .option(
    "--local [path]",
    "Use local artifacts from directory instead of GitHub (default: .genreleases)"
  )
  .action(async (options) => {
    await upgradeCommand({
      ai: options.ai,
      dryRun: options.dryRun,
      debug: options.debug,
      githubToken: options.githubToken,
      skipTls: options.skipTls,
      local: options.local,
    });
  });

program
  .command("check")
  .description("Check that all required tools are installed")
  .action(() => {
    checkCommand();
  });

program
  .command("graph")
  .description("Regenerate the codegraph and context index (.engraph/)")
  .option("--debug", "Show verbose diagnostic output")
  .option("--consistency-report", "Output consistency report as JSON to stdout")
  .action(async (options) => {
    const projectPath = process.cwd();
    const engraphDir = path.join(projectPath, ".engraph");
    if (!(await fs.pathExists(engraphDir))) {
      console.error(
        chalk.red(
          "No .engraph/ directory found. Run 'engraph init --here' first."
        )
      );
      process.exit(1);
    }

    const result = await generateCodegraph(projectPath, {
      debug: options.debug,
      consistencyReport: options.consistencyReport,
    });

    if (options.consistencyReport && result.consistencyReport) {
      process.stdout.write(JSON.stringify(result.consistencyReport, null, 2) + "\n");
    } else {
      console.log(
        chalk.green(`Codegraph and context index updated: ${result.codegraph.modules.length} modules`)
      );
    }
  });

program
  .command("lookup")
  .description("Look up conventions and verification rules for given module IDs")
  .argument("<modules...>", "Module IDs, aliases, or glob patterns")
  .option("--debug", "Show verbose diagnostic output")
  .action(async (modules: string[], options) => {
    const projectPath = process.cwd();
    const result = await lookupModules(projectPath, modules, {
      debug: options.debug,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("recall")
  .description("Search contextual commit history for given module IDs")
  .argument("<modules...>", "Module IDs, aliases, or glob patterns")
  .option("--filter <types>", "Comma-separated action types to include")
  .option("--limit <n>", "Max commits per search term (default: 50)", parseInt)
  .option("--debug", "Show verbose diagnostic output")
  .action(async (modules: string[], options) => {
    const projectPath = process.cwd();
    const result = await recallModules(projectPath, modules, {
      debug: options.debug,
      filter: options.filter?.split(","),
      limit: options.limit,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("search")
  .description("Unified lookup + recall for given module IDs")
  .argument("<modules...>", "Module IDs, aliases, or glob patterns")
  .option("--filter <types>", "Comma-separated action types to include (recall only)")
  .option("--limit <n>", "Max commits per search term (default: 50)", parseInt)
  .option("--debug", "Show verbose diagnostic output")
  .action(async (modules: string[], options) => {
    const projectPath = process.cwd();
    const result = await searchModules(projectPath, modules, {
      debug: options.debug,
      filter: options.filter?.split(","),
      limit: options.limit,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("validate")
  .description("Validate structural integrity of convention and verification files")
  .option("--fix", "Deterministically repair broken references")
  .action(async (options) => {
    const projectPath = process.cwd();
    const { result, exitCode } = await validateCommand(projectPath, {
      fix: options.fix,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(exitCode);
  });

program.parse(process.argv);
