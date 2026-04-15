<p align="center">
  <b>Engraph</b><br>
  The expertise layer for your coding agent
</p>

<div align="center">

[![npm version](https://img.shields.io/npm/v/engraph)](https://www.npmjs.com/package/engraph)
[![npm downloads](https://img.shields.io/npm/dm/engraph)](https://www.npmjs.com/package/engraph)
[![GitHub stars](https://img.shields.io/github/stars/berserkdisruptors/engraph)](https://github.com/berserkdisruptors/engraph/stargazers)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

</div>

---

Engraph creates a persistent **context graph** for your codebase that AI coding agents can tap into automatically. Instead of re-explaining architectural decisions, conventions, and design rationale every session, Engraph preserves them in structured, version-controlled files that your agent references transparently.

It works through **skills** that integrate directly into your AI coding agent, giving the agent curated architectural knowledge, not just raw source files.

## Why Engraph?

AI coding agents start fresh with each session, leading to inconsistent implementations and "amnesic" behavior where past decisions are forgotten. Engraph solves this by anchoring your agent to your project's accumulated context.

- **Consistency**: New features align with existing patterns because the agent sees documented architecture and conventions.
- **Reliability**: Design decisions, trade-offs, and rationale persist across sessions.
- **Verification**: Encode testing strategies, validation steps, and quality gates into context that agents reference automatically — so they self-verify against your project's actual standards instead of guessing, and you spend less time reviewing and correcting their work.
- **Efficiency**: Less time spent re-explaining context, more time building.

Context lives in version-controlled YAML files in `.engraph/context/` alongside your code. The repository grows smarter with every feature you complete.

## What Makes It Different

| AI Agent alone                                | AI Agent + Engraph                                              |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Context lost after each session               | Context persists in `.engraph/context/`                         |
| Agent explores only raw source files          | Agent searches curated context first, then source files            |
| Architectural decisions forgotten              | Decisions preserved, searchable, and referenced automatically      |
| Knowledge lives in individual developer heads | Shared context graph for team-wide knowledge                  |
| Each feature starts from scratch              | Each feature builds on accumulated project context                 |
| Conventions enforced manually (if at all)     | Conventions documented and surfaced to agent during development    |
| Agent guesses how to test and validate changes | Agent follows encoded verification steps and testing strategies    |

## Quick Start

### Installation

Install the engraph package globally:

```bash
npm install -g engraph
```

Then initialize in an existing project:

```bash
engraph init .
```

Initialize a new project:

```bash
engraph init my-project
```

Or with npx:

```bash
npx engraph init .
```

### Upgrading to the Latest Version

To upgrade an existing Engraph project to the latest version:

```bash
engraph upgrade
```

The upgrade command will:

- **Interactively prompt** you to select or modify your AI agents (matching the init experience)
- Update skills to the latest versions
- Preserve your existing context graph and configuration

**Options:**

```bash
# Skip the interactive prompt and upgrade specific AI agent(s)
engraph upgrade --ai claude

# Debug mode for troubleshooting
engraph upgrade --debug
```

### How To Use

After `engraph init`, open your AI coding agent in the project and start working as usual. Engraph works transparently in the background:

1. **Search context** — use `/context-search` to query the context graph for curated architectural knowledge, conventions, and verification procedures.

2. **Extract context after completing work** — run `/context-extract` to detect codebase patterns and capture conventions and verification procedures into the context graph for future sessions.

3. **Capture knowledge during a session** — use the `/context-add` skill to add specific insights, decisions, or conventions to the context graph as you discover them.

4. **Verify changes before committing** — run `/context-verify` to check your current branch changes against the context graph's conventions and verification steps.

That's it. No special workflow to follow. Your agent gets smarter context automatically, and you capture and verify knowledge when you want to.

> For a fresh project with no context yet, bootstrap the repository, by running the `context-extract` skill with no additional arguments. Use it with arguments if you want to extract deeper context on a specific topic.

## How It Works

Engraph integrates into your AI coding agent through **skills** — slash commands installed into your agent's configuration:

```
┌─────────────────────────────────────┐
│         Your AI Coding Agent        |
└──────────┬──────────────────────────┘
           │
           │  /context-search, /context-extract,
           │  /context-add, /context-verify
           │
   ┌───────▼────────┐
   │     Skills     │     Search, extract, add,
   │                │     and verify context
   └───────┬────────┘
           │
   ┌───────▼────────┐
   │    Codegraph   │     Deterministic structural
   │                │     analysis via tree-sitter
   └───────┬────────┘
           │
  ┌────────▼───────────┐
  │   Context Graph    │  .engraph/context/
  │                    │  conventions/, verification/
  └────────────────────┘
```

### Skills

Five skills are installed as slash commands:

- **`context-search`** — Search the context graph for curated codebase knowledge. Queries the codegraph for module resolution, then retrieves scoped conventions and verification procedures.

- **`context-extract`** — Detect codebase patterns and propose convention and verification suggestions. Uses the codegraph's consistency reports as deterministic grounding, interprets them into suggestions, and lets the user review before persisting.

- **`context-add`** — Add new knowledge to the context graph. Classifies input into the right domain (conventions or verification), grounds it with real codebase examples, and creates a structured context file.

- **`context-verify`** — Verify current branch changes against the context graph. Checks conventions for static compliance and presents verification steps as a checklist.

- **`context-commit`** — Write contextual commits that capture intent, decisions, and constraints alongside code changes.

## The Context Graph

The context graph lives in `.engraph/context/` and is organized into three domains:

```
.engraph/context/
├── _index.yaml              # Routing table for module-scoped context queries
├── conventions/             # Coding standards and patterns
│   ├── naming-conventions.yaml
│   └── ...
└── verification/            # Testing and quality context
    ├── test-strategy.yaml
    └── ...
```

These files capture knowledge that source code alone cannot convey: **why** something was built a certain way, what patterns to follow, what trade-offs were made, and how components relate. This is the knowledge that typically lives in developers' heads and gets lost between sessions.

Context files are version-controlled YAML, designed to be reviewed in PRs alongside code changes.

> Read more here if you want to get a [deeper understanding of our context taxonomy](https://engraph.dev/engraph/concepts/context-taxonomy)

## Supported AI Agents

Engraph currently supports three AI coding agents:

| Agent | Skills |
|-------|--------|
| **Claude Code** | context-search, context-extract, context-add, context-verify, context-commit |
| **Cursor** | context-search, context-extract, context-add, context-verify, context-commit |
| **OpenCode** | context-search, context-extract, context-add, context-verify, context-commit |

### Want support for another agent?

Support for **Gemini CLI**, **Codex CLI**, **GitHub Copilot**, and others is planned but not yet implemented. We can't test every agent ourselves, so we're relying on community contributions.

If you use an agent that isn't supported yet, we'd love your help adding it. The integration pattern is straightforward — each agent needs skill templates in the agent's configuration folder. Check the existing implementations for Claude, Cursor, and OpenCode as reference. [Open an issue](https://github.com/berserkdisruptors/engraph/issues) to discuss or submit a PR.

---

## Contributing

Engraph is **open source** and welcomes contributions! We're building the expertise layer for agentic coding together.

### Quick Start for Contributors

```bash
git clone https://github.com/berserkdisruptors/engraph.git
cd engraph
npm install
npm run build
npm link
```

### Testing

We use [Vitest](https://vitest.dev/) with a three-tier testing strategy:

- **Unit tests** (`tests/unit/`) — fast, isolated tests for individual functions and modules
- **Integration tests** (`tests/integration/`) — test interactions between components (filesystem, config loading)
- **E2E tests** (`tests/e2e/`) — test full CLI commands against real project fixtures

All PRs must pass the full test suite. Aim to add tests for any new functionality or bug fixes.

```bash
npm test                  # Run all tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e          # End-to-end tests only
npm run test:coverage     # Run tests with coverage report
npm run test:watch        # Watch mode for development
```



### How to Contribute

1. **Check existing issues** - [View open issues](https://github.com/berserkdisruptors/engraph/issues)
2. **Create an issue** - Describe the problem or feature request
3. **Fork & branch** - Create a feature branch following our naming convention
4. **Write tests** - Add unit/integration/e2e tests for your changes
5. **Run the test suite** - `npm test` to verify everything passes
6. **Submit PR** - Describe your changes and link related issues

Adding support for a new AI agent is a great way to contribute — see [Supported AI Agents](#supported-ai-agents) for details.

---

## Support & Community

- **Website**: [https://buildforce.dev/engraph](https://buildforce.dev/engraph) - Learn more about Engraph
- **GitHub Repository**: [https://github.com/berserkdisruptors/engraph](https://github.com/berserkdisruptors/engraph)
- **npm Package**: [https://www.npmjs.com/package/engraph](https://www.npmjs.com/package/engraph)
- **GitHub Issues**: [Report bugs or request features](https://github.com/berserkdisruptors/engraph/issues)
- **Discussions**: [Ask questions or share ideas](https://github.com/berserkdisruptors/engraph/discussions)

---

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

---

## Star the Project! ⭐

If Engraph helps your AI coding agent make better decisions, please star the project on GitHub. It helps us reach more developers and build a stronger community.


