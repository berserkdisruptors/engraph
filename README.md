<p align="center">
  <b>Engraph</b><br>
  The expertise layer for your coding agent
</p>

<div align="center">

[![npm version](https://img.shields.io/npm/v/engraph)](https://www.npmjs.com/package/engraph)
[![npm downloads](https://img.shields.io/npm/dm/engraph)](https://www.npmjs.com/package/engraph)
[![GitHub stars](https://img.shields.io/github/stars/berserkdisruptors/engraph)](https://github.com/berserkdisruptors/engraph/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

Engraph builds a persistent **context layer** alongside your codebase - structure, conventions, and the reasoning behind decisions. AI coding agents tap into it automatically. No more re-explaining the project every session. The agent already has it.

It works through **skills** that integrate directly into your AI coding agent, giving the agent curated codebase expertise rather than just raw source files.

## Why Engraph?

AI coding agents start fresh with each session. Decisions get forgotten, conventions drift, the same questions get asked again next week.

The deeper issue: reading code gives an agent **knowledge** - what exists, what calls what. It doesn't give it **expertise** - the judgment, decisions, and constraints that explain why the code is shaped this way. Knowledge is derivable from source. Expertise isn't. Engraph captures the expertise.

- **Consistency**: New features align with existing patterns because the agent reads scoped conventions before working - the rules that apply to the modules being changed, not generic style guides.
- **Reliability**: Design decisions, rejected alternatives, and constraints get captured in contextual commits - durable across sessions and agents, queryable from git history forever.
- **Verification**: Encode testing strategies, validation steps, and quality gates into context files that agents reference automatically - so they self-verify against your project's actual standards instead of guessing.
- **Efficiency**: Less time re-explaining context, more time building.

The context layer lives in three places, all of which travel with your codebase: a codegraph in `.engraph/codegraph/` that mirrors your module structure, version-controlled context files in `.engraph/context/` for conventions and verification procedures, and contextual commits embedded in git history for decisions, rejected alternatives, and constraints. Everything stays in your repo, in formats you already understand.

## What Makes It Different

| AI Agent alone                                                           | AI Agent + Engraph                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Reads source files in isolation, no awareness of cross-module dependencies or blast radius | Queries a deterministic module graph: imports, exports, dependencies, what breaks when X changes |
| Infers conventions from the few files it sampled - often wrong, often inconsistent | Conventions encoded as YAML, scoped to the modules they apply to, surfaced automatically    |
| Can't answer "why was this done this way?" - the reasoning isn't in the code | Decisions, rejected alternatives, and constraints queryable from structured commit history  |
| Guesses what "done" means for your project                               | Follows verification procedures encoded for the specific modules being changed              |
| Project knowledge lives in individual developer heads                    | Captured in the repo once, accessible to anyone - humans and agents alike                   |

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

### Upgrading

```bash
engraph upgrade
```

Pulls the latest skill versions into your selected agents while preserving your context layer and configuration. See `engraph upgrade --help` for options like `--ai claude` and `--debug`.

## How To Use

After `engraph init`, open your AI coding agent and start working as usual.

Engraph isn't a fixed workflow. It's a set of primitives - five skills (`context-search`, `context-extract`, `context-add`, `context-verify`, `context-commit`) and five CLI commands (`graph`, `lookup`, `recall`, `search`, `validate`) - that compose. The four examples below are illustrations, not a prescription. Some teams wire the primitives into pre-commit hooks. Others run validate in CI on every PR. Others build custom orchestration scripts on top of the JSON output. Some only invoke them ad-hoc inside the agent. Pick what fits, ignore the rest, assemble your own.

### Example 1: Briefing - "What do I need to know about X?"

Starting work in an unfamiliar area, picking up a teammate's PR for review, or stepping into a module you haven't touched in a year. The same problem each time - most of what you'd want to know isn't in the code.

```
/context-search I'm about to touch the auth flow - what do I need to know?
```

The skill resolves the query to relevant modules via the codegraph, pulls every convention scoped to those modules, and walks the contextual commit history for past decisions, rejected alternatives, and constraints. The output isn't a recap of source files - it's the architectural decisions, gotchas, and "why is it like this" answers you'd otherwise have to ask the senior engineer for.

PR description generation is the same primitive narrowed to a branch diff: collect the contextual commits on the branch, surface decisions and verification done, draft a description from data instead of memory.

### Example 2: Impact prediction - "What will this change actually affect?"

You have a planned change but you're not yet sure of the blast radius. Before writing code:

```
/context-search I want to change how JWT validation works in the auth middleware - what depends on it?
```

The skill traverses the codegraph from `auth-middleware`, finds every module that imports it, and surfaces what matters at each: the architectural decisions that constrain your options (e.g., the statelessness choice from March 2025), the API contract with the mobile clients, and the post-mortem from the last time someone attempted this. You go in with eyes open.

The point is pre-implementation. The whole value is making the right call before the diff exists, not auditing it afterwards.

### Example 3: Self-review - "Did I do this right?"

You've finished implementing a change. Before opening the PR:

```
/context-verify
```

The skill maps your changed files to module IDs, loads the conventions and verification procedures that apply to those specific modules, and runs them as a checklist. If you touched `packages/db/prisma/schema.prisma` and your change drops a column without acknowledgment, the verification flags it. If your error handling skips an established pattern, the convention check flags it.

When something's flagged, the next move is yours: the code is wrong (fix it), the convention is stale (update it), or the rule is too strict (refine it). The skill runs the check; the judgment stays with you.

Wire it into a pre-commit hook, into CI on every PR, or just invoke ad-hoc before pushing. Same primitive, different surface.

### Example 4: Code archeology - "Why is this the way it is?"

You're staring at code that surprises you. A retry capped at 3 attempts. A flag on a service that doesn't seem necessary. An architectural choice you'd build differently today.

```
/context-search why does PaymentService retry with exponential backoff capped at 3 attempts?
```

Engraph walks the contextual commit history for the payments module: the original decision (commit `abc123`), the rejection of unbounded retries (commit `def456`), the bug fix that motivated the cap (commit `ghi789`). You get the WHY the code can't tell you on its own.

The same primitive answers refactoring research ("I want to migrate from JWT to sessions - what reasons informed the original choice, and which still hold?") and bug investigations ("I think this is caching-related - what assumptions did caching ship with?").

## How It Works

Engraph's runtime is a small set of skills installed into your AI coding agent, plus a CLI that exposes deterministic operations the skills (and you) can call directly. The data they operate on lives in three persistent artifacts.

```
┌─────────────────────────────────────────────────┐
│              Your AI Coding Agent               │
└──────────────────────┬──────────────────────────┘
                       │  /context-search, /context-extract,
                       │  /context-add, /context-verify, /context-commit
                       │
              ┌────────▼─────────┐
              │     Skills       │   Read, write, and verify context
              └────────┬─────────┘
                       │  invokes
              ┌────────▼─────────┐
              │   Engraph CLI    │   engraph graph / lookup / recall /
              │                  │   search / validate
              └────────┬─────────┘
                       │  reads & writes
   ┌───────────────────┼────────────────────────────┐
   │                   │                            │
┌──▼──────────────┐ ┌──▼──────────────────────┐ ┌───▼─────────────────┐
│   Codegraph     │ │     Context Files       │ │ Contextual Commits  │
│ (.engraph/      │ │ (.engraph/context/)     │ │ (in git history)    │
│  codegraph/)    │ │ conventions/            │ │ scoped action lines │
│                 │ │ verification/           │ │ via /context-commit │
│ Auto-generated  │ │                         │ │                     │
│ structural map  │ │ Version-controlled YAML │ │ Captured per commit │
│ Not committed   │ │ Reviewed in PRs         │ │ Recalled by module  │
└─────────────────┘ └─────────────────────────┘ └─────────────────────┘
```

### The three persistent artifacts

**Codegraph** - `.engraph/codegraph/index.yaml` and recursive sub-graphs. A deterministic structural map of your codebase, generated by tree-sitter AST analysis. Modules, files, exports, imports, dependency edges, test files. Regenerated by `engraph graph` in seconds. Not version-controlled - it's a performance cache rebuilt from source.

**Context files** - `.engraph/context/conventions/*.yaml` and `.engraph/context/verification/*.yaml`. The behavioral layer: how things are done, how to verify they're correct. Each file declares which modules it applies to via bridge fields (`applies_to_modules`, `triggered_by_modules`) using codegraph module IDs and aliases. Version-controlled YAML, designed for PR review.

**Contextual commits** - embedded in git commit bodies via `/context-commit`. Structured action lines (`intent(scope)`, `decision(scope)`, `rejected(scope)`, `constraint(scope)`, `learned(scope)`) where the scope is a codegraph module ID or alias. Recalled by `engraph recall` for any module.

The `.engraph/context/_index.yaml` file is a generated routing table that maps modules to applicable conventions and verification - regenerated as part of `engraph graph`. Source of truth is always the individual context files.

### Skills

Five skills are installed as slash commands in your agent:

- **`context-search`** - Search the context layer for curated codebase knowledge. Resolves the query to module IDs via the codegraph, then retrieves scoped conventions, verification procedures, and contextual commit history.

- **`context-extract`** - Detect codebase patterns and propose convention and verification suggestions. Uses the codegraph's consistency reports as deterministic grounding, interprets them into ranked suggestions, and lets you review before persisting.

- **`context-add`** - Add new knowledge to the context layer. Classifies input into the right domain (conventions or verification), grounds it with real codebase examples, and creates a structured context file with bridge fields.

- **`context-verify`** - Verify current branch changes against the context layer. Maps changed files to module IDs, loads scoped conventions and verification procedures, and runs them as a checklist with structured JSON output.

- **`context-commit`** - Write contextual commits that capture intent, decisions, rejected alternatives, and constraints alongside code changes. Scopes are validated against codegraph module IDs and aliases.

### CLI commands

The skills invoke these under the hood, but they're available for direct use too:

| Command            | Purpose                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| `engraph graph`    | Regenerate the codegraph and context index. Fast, deterministic, no LLM calls.        |
| `engraph lookup`   | Look up conventions and verification scoped to one or more module IDs / aliases.      |
| `engraph recall`   | Recall contextual commit history scoped to one or more module IDs / aliases.          |
| `engraph search`   | Unified `lookup` + `recall` in a single call. The skill-facing convenience command.   |
| `engraph validate` | Check context files against the codegraph for structural drift. Add `--fix` to repair. |

All commands emit structured JSON, making them safe to script against and easy to consume from orchestration harnesses.

## AI Agent Compatibility

Engraph ships standard skills - plain folders with `SKILL.md` entry points. Any AI coding agent that reads skills from `.agents/skills/` (or installs them into its own equivalent config folder via `engraph init`) will work. We just write skills; the agent picks them up. There's no agent-specific glue, no per-agent scripts, no custom hooks.

The agents we've explicitly tested:

- **Claude Code**
- **Cursor**
- **OpenCode**
- **Pi**

### Other agents

Anything that supports the skills standard should work. **Gemini CLI**, **Codex CLI**, and **GitHub Copilot** haven't been explicitly tested by us yet. If you've used Engraph with one of these or with another agent that supports skills, [open an issue](https://github.com/berserkdisruptors/engraph/issues) to share what you found, or send a PR adding it to the tested list.

---

## Contributing

Engraph is **open source** - issues and PRs welcome.

The repo is engraphed. Every architectural decision, every rejected alternative, every convention is captured in `.engraph/` and the contextual commit history. If you have Engraph installed, run `/context-search` on the area you're about to touch before reading the source cold - the repo will brief you better than any docs we could write here.

### Quick Start

```bash
git clone https://github.com/berserkdisruptors/engraph.git
cd engraph
npm install
npm run build
npm link
```

### How to Contribute

1. Browse [open issues](https://github.com/berserkdisruptors/engraph/issues) or open one describing what you'd like to change
2. Fork, branch, write code and tests, run `npm test`
3. Submit a PR linking related issues

Tried Engraph with an agent that's not on the tested list? See [AI Agent Compatibility](#ai-agent-compatibility) - sharing what you found is a great way to contribute.

---

## Support & Community

- **Website**: [https://buildforce.dev/engraph](https://buildforce.dev/engraph) - Learn more about Engraph
- **GitHub Repository**: [https://github.com/berserkdisruptors/engraph](https://github.com/berserkdisruptors/engraph)
- **npm Package**: [https://www.npmjs.com/package/engraph](https://www.npmjs.com/package/engraph)
- **GitHub Issues**: [Report bugs or request features](https://github.com/berserkdisruptors/engraph/issues)
- **Discussions**: [Ask questions or share ideas](https://github.com/berserkdisruptors/engraph/discussions)

---

## License

MIT - see [LICENSE](LICENSE) for details.

---

## Star the Project! ⭐

If Engraph helps your AI coding agent make better decisions, please star the project on GitHub. It helps us reach more developers and build a stronger community.