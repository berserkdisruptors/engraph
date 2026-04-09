---
name: context-search
description: >-
  Search the Engraph context repository for curated codebase knowledge —
  conventions, verification standards, design decisions, and historical
  reasoning. Taps all Engraph resources: codegraph (structural), conventions
  and verification (behavioral), and contextual commit history (temporal).
  Use when the conversation needs context that source files alone cannot provide.
agents: [claude, cursor, opencode]
allowed-tools: [Read, Glob, Grep, Bash]
---

User input:

$ARGUMENTS

---

## Purpose

This skill produces a synthesized briefing of **pure signal** — only information that cannot be easily retrieved by the agent reading source files alone. Source files show WHAT the code does. This skill surfaces WHY it was built that way, what conventions apply, what was tried and rejected, and what constraints shaped the implementation.

---

## The Four-Step Process

### Step 1: Regenerate Deterministic Data

Run `engraph graph` to refresh the codegraph and context index. This is fast, deterministic, and zero LLM calls. Skip only if you just ran it in this session.

```bash
engraph graph
```

### Step 2: Module ID Resolution

Read `.engraph/codegraph/index.yaml` and determine which module IDs are relevant to the user's query.

**How to resolve:**

1. Read the root codegraph index — it contains the project profile and all top-level modules with their descriptions, dependencies, and imports.
2. Match the query to module IDs based on the module descriptions, file paths, and the topic being asked about.
3. If a relevant module has a `sub_graph` field, follow that reference and read the sub-graph to find deeper, more specific modules.
4. **Over-include rather than under-include.** False positives are filtered in synthesis (cheap). False negatives miss relevant conventions (expensive).

**Examples:**

| Query | Resolved Module IDs |
|-------|---------------------|
| "what conventions apply to the codegraph?" | `commands/graph` |
| "how should I write a new skill?" | `templates/skills/*` modules |
| "what are the testing standards?" | `*` (global query) |
| "tell me about the upgrade migrations" | `commands/upgrade/migrations` |

**Structural context as a byproduct:** As you read the codegraph for resolution, you naturally absorb module descriptions, dependencies, imports/exports, and blast radius. This structural understanding becomes the third data source alongside lookup and recall — no separate step needed.

### Step 3: Retrieve Context

Run `engraph search` with the resolved module IDs to retrieve all context in one call:

```bash
engraph search <module-id-1> <module-id-2> ...
```

You can also use aliases instead of full module IDs (e.g., `codegraph` instead of `commands/graph`). Check `.engraph/codegraph/index.yaml` for available aliases.

This returns JSON with:
- **lookup.conventions** — conventions scoped to those modules
- **lookup.verification** — verification procedures triggered by those modules
- **lookup.global_conventions** — conventions that apply to all modules (`*`)
- **recall.commits** — contextual commit history with decisions, rejections, constraints, and learnings

If `engraph search` is not available, run `engraph lookup` and `engraph recall` separately:
```bash
engraph lookup <module-ids...>
engraph recall <module-ids...>
```

### Step 4: Synthesize

Combine the three data sources into a response:

1. **Conventions** (from lookup) — what patterns to follow, what's enforced
2. **Verification procedures** (from lookup) — how to know the code is correct
3. **Historical context** (from recall) — decisions made, alternatives rejected, constraints discovered, lessons learned
4. **Structural notes** (from step 2 codegraph read) — dependencies, blast radius, module relationships

**Synthesis rules:**

- **Pure signal only.** Don't repeat what's in the source files. If the agent can get it by reading code, don't include it.
- **Lead with understanding, not sourcing.** Don't say "According to conventions/naming.yaml..." — just state the convention.
- **Integrate, don't enumerate.** Weave findings together naturally rather than listing them.
- **Acknowledge gaps honestly.** If context doesn't exist for something, say so.
- **Historical context is highest value.** Decisions and rejections from contextual commits prevent the agent from re-proposing already-rejected approaches.

**Response structure:**

```
[Direct answer to the query]

[Relevant conventions and verification procedures]

[Historical reasoning — decisions, rejections, constraints from commit history]

[Structural context — dependencies, blast radius, if relevant]

[Gaps or open threads worth exploring]
```

---

## When to Skip Retrieval

Skip the full four-step process ONLY when the query has nothing to do with this codebase:
- General programming questions
- Third-party library evaluation
- External concepts the context repository cannot contain

In these cases, respond directly. **When in doubt, run the retrieval.** An empty result is informative; skipping it is not.

---

## Error Handling

**No codegraph exists:** Inform the user: "No codegraph found. Run `engraph graph` first."

**No context found:** "I don't have documented context about {topic}. The context repository doesn't cover this area yet."

**Partial context:** Use what exists, acknowledge the gaps, offer to dig deeper via source files.

**Conflicting information:** Surface the tension: "There's a conflict — the convention says X but the commit history shows Y was rejected. This might need resolution."

---

## Design Principles

- **Context first, then source.** Curated context before raw file reading.
- **Pure signal.** Only what source files cannot provide.
- **Over-include in resolution, filter in synthesis.** Broad module matching, selective output.
- **Honest about gaps.** Never fabricate context.
- **Single skill, sequential steps.** No sub-agent dispatch — you do the work directly.
