---
name: context-extract
description: >-
  Detect codebase patterns and propose convention and verification suggestions
  grounded in deterministic consistency reports. Presents suggestions for user
  review before persisting. Use to bootstrap a fresh repo's context layer or
  to refresh it as the codebase evolves.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# Context Extraction

You detect codebase patterns from deterministic data and propose convention and verification suggestions the user reviews before persisting. You do not fabricate patterns — you interpret factual observations grounded in the codegraph's consistency reports and additional source files.

User input:

$ARGUMENTS

---

## Step 1: Generate Consistency Report

Run `engraph graph --consistency-report` via Bash and capture the JSON output from stdout.

```bash
engraph graph --consistency-report
```

This produces both:
- A fresh codegraph (written to `.engraph/codegraph/`)
- A JSON consistency report printed to stdout with four sections: `namingPatterns`, `moduleInterfaces`, `dependencyDirection`, `linterFormatterConfig`

Parse the JSON output. If the command fails, stop and report the error.

Also read `.engraph/codegraph/index.yaml` for the module inventory (IDs, aliases, file lists).

## Step 2: Load Existing Context

Read all YAML files in `.engraph/context/conventions/` and `.engraph/context/verifications/` (excluding `_schema.yaml` files). These are already-covered patterns.

Also read the schemas for reference:
- `.engraph/context/conventions/_schema.yaml` — convention file structure
- `.engraph/context/verifications/_schema.yaml` — verification file structure

If no existing context files exist, this is a cold start — all suggestions are candidates.

## Step 3: Read Additional Sources

Read these files if they exist — they provide signals for verification suggestions and deeper convention interpretation:

**Build/task runner configs:**
- `package.json` (scripts section), `Makefile`, `Cargo.toml`, `pyproject.toml`, `build.gradle`, `Taskfile.yml`

**README and documentation:**
- `README.md` — testing procedures, setup instructions, documented conventions

**CI config files:**
- `.github/workflows/*.yml`, `.gitlab-ci.yml`, `.circleci/config.yml`

**Linter/formatter config files:**
- Read the actual config files identified in the consistency report's `linterFormatterConfig.tools[].configFile` paths — these contain the rules the LLM interprets into convention suggestions

If `$ARGUMENTS` is non-empty, use it to focus your reading on relevant sources.

## Step 4: Generate Suggestions

Produce 3–8 suggestions total. Each suggestion is either a **convention** or a **verification**.

### From consistency report (deterministic grounding):

- **Naming patterns** with 90%+ consistency → `naming-convention` suggestions. Use the `byModule` breakdown for `applies_to_modules`.
- **Module interface patterns** (e.g., all modules use barrel exports, common imports) → `code-convention` suggestions.
- **Linter/formatter config** presence → `code-convention` suggestions at `enforcement: reference` level (documenting what's already enforced by tooling). Read the actual config files from Step 3 for deeper interpretation.

### From additional sources (LLM-interpreted):

- **README testing procedures** → `verification` suggestions
- **CI workflow jobs** — but only as **individual, granular verifications** (see "What makes a good suggestion" below)
- **Non-trivial build/task runner scripts** (beyond standard test/lint/build) → `verification` suggestions

### What makes a good suggestion

A convention or verification must be **specific enough to produce a concrete, actionable rule** that an agent can follow or violate. Before including a suggestion, apply these tests:

**A good convention:**
- Describes a specific pattern an agent could accidentally break: "All exported functions use camelCase" — an agent could write `ProcessData` and break it.
- Is something a developer would correct in a PR review: "We use barrel index.ts files in command modules" — a reviewer would say "add an index.ts."
- Has a clear right/wrong: either you follow it or you don't.

**A good verification:**
- Describes a specific check with a specific trigger scope: "When modifying files that import Node built-ins, verify compatibility with Node 18" is granular. "Here's everything CI does" is a summary.
- Each verification addresses ONE concern. If you're describing multiple unrelated checks, split them into separate suggestions.
- Has a meaningful `triggered_by_modules` scope narrower than `*` when possible: a verification about database migrations should only trigger when migration files change, not on every PR.

**NOT a convention or verification — do not suggest these:**
- **Dynamic codegraph observations** like "these modules are hubs" or "this module has high blast radius." The codegraph already provides `imported_by` data dynamically — encoding a static snapshot as a convention would go stale. Hub/leaf module analysis is the responsibility of `context-search` combining live codegraph signals at query time, not a persisted file.
- **Dependency direction summaries** like "module A depends on module B." This is what the codegraph's `imports`/`imported_by` edges already show, and it changes as the code evolves. Persisting it creates a stale duplicate of deterministic data.
- **Catch-all bundles** that combine multiple unrelated concerns into one item. "CI runs type checking, unit tests, integration tests, build, and E2E tests across Node 18/20/22" is five separate verifications pretending to be one. Each should have its own scope, trigger, and description. Bundling defeats the purpose of granular, module-scoped context.
- **Vague advice** like "be careful when modifying this module" or "this module is important." If you can't state a specific pattern that can be followed or violated, it's not a convention.
- **Restating what tooling already enforces** without adding value. "TypeScript requires type annotations" is not a convention — the compiler already enforces it. But "We use explicit return types on all exported functions" IS a convention if the codebase follows it consistently and the compiler doesn't require it.

### Filtering:

Before including a suggestion, check if it semantically overlaps with any existing context file loaded in Step 2. If covered, skip it. Compare meaning, not exact strings.

### Prioritization:

1. High consistency patterns (90%+ match across codebase) for conventions
2. Non-trivial verification procedures (beyond "run npm test") for verifications
3. Patterns most useful for an agent working in the codebase — the kind of thing a new engineer would get wrong on their first PR

### Edge case:

If the codebase is too small or patterns are too weak (< 5 modules, < 90% consistency on all naming patterns, no CI config), produce fewer or zero suggestions and tell the user: "Not enough patterns detected for convention suggestions. Use `/context-add` to manually document conventions as you establish them."

## Step 5: Present Suggestions

This is the user-facing output. It must be educational — many users are encountering conventions and verifications as concepts for the first time. Each suggestion should make the user think "I didn't realize we were so consistent with that" or "I keep telling my agent this manually every session."

Present each suggestion as a numbered item with rich context:

```
---
### #N [convention|verification] — Title

**The pattern:** What you observed in the codebase. Be specific — cite numbers,
module names, file paths. Don't assume the user knows their own codebase
statistics. "All 80 exported functions use camelCase with zero exceptions"
is more compelling than "functions use camelCase."

**Why this matters:** Explain what happens when an agent doesn't know this.
Connect to real pain points: inconsistent PRs, repeated corrections, style
debates, broken builds. For verifications, explain what gets missed without it.

**What encoding this gives you:** Explain the concrete benefit of persisting
this as a context file. How will context-search surface it? How will
context-verify check it? What will change in the agent's behavior?

**Applies to:** [module IDs/aliases, or * for global]
**Evidence:** [specific consistency report data or source file path]
---
```

**Writing guidelines for suggestions:**

- Write for a developer who is smart but new to the concept of encoded conventions. They know their codebase but haven't thought about making patterns explicit.
- Use concrete numbers and examples from the consistency report. "100% of 80 functions" is better than "all functions."
- For dependency-direction suggestions, explain what "hub module" or "leaf module" means in plain terms — don't use jargon without explanation.
- For verification suggestions, describe the actual CI/build steps, not just "CI enforces this." The user should understand the verification procedure.
- Don't be brief for the sake of brevity. Each suggestion is a teaching moment. 3-6 lines per section is fine.

After presenting all suggestions, show the review instructions:

```
Review the suggestions above. You can:
- Accept: "accept #1, #3"
- Reject: "reject #2" (will reappear on next run)
- Tweak: "tweak #4: [your modification]"
- Accept all: "accept all"
- Reject all: "reject all"
```

**STOP here and wait for the user's response.** Do not proceed to Step 6 until the user has reviewed.

## Step 6: Process User Response

Parse the user's response for accept/reject/tweak directives.

### For each accepted suggestion:

Write a YAML file following the appropriate schema.

**Convention files** → `.engraph/context/conventions/{id}.yaml`:

```yaml
id: {kebab-case-id}
name: "{Title}"
type: convention
sub_type: {naming-convention|code-convention|dependency-rule|architectural-pattern}
enforcement: {recommended|reference}
applies_to_modules:
  - "{module-id-1}"
  - "{module-id-2}"
provenance: detected
created: "{today YYYY-MM-DD}"
last_updated: "{today YYYY-MM-DD}"

description: |
  {Description from the suggestion}

reference_files:
  - "{path to a real file demonstrating this convention}"
```

**Verification files** → `.engraph/context/verifications/{id}.yaml`:

```yaml
id: {kebab-case-id}
name: "{Title}"
type: verification
triggered_by_modules:
  - "{module-id-or-glob}"
provenance: detected
created: "{today YYYY-MM-DD}"
last_updated: "{today YYYY-MM-DD}"

{relevant optional fields from the verification schema — quality_standards, test_expectations, review_checklist, etc.}
```

**Enforcement heuristics:**
- `enforcement: recommended` for detected conventions (not `strict` — that's for human-authored conventions)
- `enforcement: reference` for conventions documenting linter-enforced rules (the linter already enforces it)

### For each tweaked suggestion:

Apply the user's modification to the suggestion content, then write as above.

### For rejected suggestions:

Do nothing. They will reappear on the next run since the skill is stateless.

## Step 7: Regenerate Context Index

After writing all accepted files, run `engraph graph` to regenerate the context index so the new files are discoverable by `engraph lookup` and `context-search`.

```bash
engraph graph
```

## Step 8: Present Summary

```
Context updated: {N} conventions, {M} verifications created.
Files: {list of created file paths}
```
