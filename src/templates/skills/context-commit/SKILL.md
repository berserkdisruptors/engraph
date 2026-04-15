---
name: context-commit
description: >-
  Write contextual commits that capture intent, decisions, and constraints
  alongside code changes. Use when committing code, finishing a task, or
  when the user asks to commit. Extends Conventional Commits with structured
  action lines in the commit body that preserve WHY code was written, not
  just WHAT changed. Validates scopes against the codegraph.
agents: [claude, cursor, opencode]
---

# Contextual Commits

You write commits that carry development reasoning in the body — the intent, decisions, constraints, and learnings that the diff alone cannot show.

## The Problem You Solve

Standard commits preserve WHAT changed. The diff shows that too. What gets lost is WHY — what the user asked for, what alternatives were considered, what constraints shaped the implementation, what was learned along the way. This context evaporates when the session ends. You prevent that.

## Before You Write the Commit

### 0. Ensure Fresh Codegraph

Run `engraph graph` to ensure the codegraph is up to date. This is fast and deterministic. Skip only if you just ran it in this session.

```bash
engraph graph
```

### 1. Check Staged Changes

Run `git diff --cached --stat`.

- **If staged changes exist:** these are the commit scope. Do not consider unstaged or untracked files — the user has already expressed what belongs in this commit by staging it.
- **If nothing is staged:** consider all unstaged modifications and untracked files as candidates. Use session context and the diff to decide what to stage and commit.

### 2. Check Branch History for Existing Context

Run `git log --format="%B" HEAD~10..HEAD` (or since the branch diverged from main) to read action lines already captured in prior commits on this branch.

**Do not repeat reasoning that is already persisted.** Plan commits (`docs(plan): ...`) and earlier implementation commits may already capture intent, decisions, rejected alternatives, and constraints. Your commit should only carry:
- **New reasoning** that emerged during this specific implementation work
- **Refinements** to prior decisions (e.g., a decision changed during implementation)
- **Implementation-specific learnings** discovered while writing the code

If a decision was already stated in a plan commit and the implementation followed it without change, do not restate it. The git history is a timeline — each commit adds new signal, not a restated summary.

**Prefer an empty body over fabricated context.** A clean conventional commit subject with no action lines is a valid contextual commit. Not every commit produces new reasoning worth capturing. If checking the branch history and session context yields no new signal, write the subject line only. The goal is signal density, not action line count.

### 3. Resolve Scopes from Codegraph

Read `.engraph/codegraph/index.yaml` and map each changed file to its module ID. If a module has a `sub_graph` field, follow that reference for deeper resolution.

**Aliases are preferred when available.** Check the `alias` field on each module — if present, use the alias as the scope instead of the path-based module ID. The whole point of aliases is to provide short, developer-friendly code names.

Examples:
- File `src/commands/graph/scanner.ts` → module `commands/graph` → alias `codegraph` → scope `codegraph`
- File `src/commands/upgrade/migrations/v2_0.ts` → module `commands/upgrade/migrations` → alias `migrations` → scope `migrations`
- File `src/utils/config.ts` → module `utils` → no alias → scope `utils`
- File `src/cli.ts` → module `root` → no alias → omit scope from subject line (see below)

**If no codegraph exists** (project hasn't run `engraph init`), fall back to human-readable concept labels.

### 4. Determine Subject Line Scope

- Use the alias (or module ID if no alias) of the primary changed module
- If the commit touches multiple modules, use their lowest common ancestor
- **If scope resolves to `root`:** omit the scope from the subject line entirely. Write `type: subject` not `type(root): subject`. Keep `root` in body action lines where it's useful for filtering.

### 5. Validate Scopes

Every `scope()` in action lines must reference a valid alias or module ID from the codegraph. Before writing the commit:
- Collect all scopes you plan to use
- Verify each one exists as either an `alias` or `id` in the codegraph
- If a scope doesn't match, find the correct module or use a valid ancestor

## Commit Format

The subject line is a standard Conventional Commit. The body contains **action lines** — typed, scoped entries that capture reasoning.

```
type(scope): subject line (standard conventional commit)

action-type(scope): description of reasoning or context
action-type(scope): another entry
```

### Subject Line

Follow Conventional Commits exactly:
- `feat(auth): implement Google OAuth provider`
- `fix(payments): handle currency rounding edge case`
- `refactor(notifications): extract digest scheduling logic`

### Action Lines

Each line in the body follows: `action-type(scope): description`

Use lowercase for description text — no sentence case.

## Action Types

Use only the types that apply. Most commits need 1-3 action lines. Never pad with noise.

### `intent(scope): ...`
What the user wanted to achieve and why. Captures the human's voice, not your interpretation.

- `intent(auth): social login starting with Google, then GitHub and Apple`
- `intent(notifications): users want batch notifications instead of per-event emails`

**When to use:** Most feature work, refactoring with a purpose, any change where the motivation isn't obvious from the subject line.

### `decision(scope): ...`
What approach was chosen when alternatives existed. Brief reasoning.

- `decision(oauth-library): passport.js over auth0-sdk for multi-provider flexibility`
- `decision(digest-schedule): weekly on Monday 9am, not daily — matches user research`

**When to use:** When you evaluated options. Skip for obvious choices with no real alternatives.

### `rejected(scope): ...`
What was considered and explicitly discarded, with the reason. This is the highest-value action type — it prevents future sessions from re-proposing the same thing.

- `rejected(oauth-library): auth0-sdk — locks into their session model, incompatible with redis store`
- `rejected(currency-handling): account-level default — too limiting for marketplace sellers`

**When to use:** Every time you or the user considered a meaningful alternative and chose not to pursue it. Always include the reason.

### `constraint(scope): ...`
Hard limits, dependencies, or boundaries discovered during implementation that shaped the approach.

- `constraint(callback-routes): must follow /api/auth/callback/:provider pattern per existing convention`
- `constraint(stripe-integration): currency required at PaymentIntent creation, cannot change after`

**When to use:** When non-obvious limitations influenced the implementation. Things the next person working here would need to know.

### `learned(scope): ...`
Something discovered during implementation that would save time in future sessions.

- `learned(passport-google): requires explicit offline_access scope for refresh tokens, undocumented in quickstart`
- `learned(stripe-multicurrency): presentment currency and settlement currency are different concepts`

**When to use:** "I wish I'd known this before I started" moments. Library gotchas, API surprises, non-obvious behaviors.

## Examples

### Simple fix — no action lines needed

```
fix(button): correct alignment on mobile viewport
```

The conventional commit subject is sufficient. Don't add noise.

### Moderate feature

```
feat(notifications): add email digest for weekly summaries

intent(notifications): users want batch notifications instead of per-event emails
decision(digest-schedule): weekly on Monday 9am — matches user research feedback
constraint(email-provider): SendGrid batch API limited to 1000 recipients per call
```

### Complex architectural change

```
refactor(payments): migrate from single to multi-currency support

intent(payments): enterprise customers need EUR and GBP alongside USD
decision(currency-handling): per-transaction currency over account-level default
rejected(currency-handling): account-level default too limiting for marketplace sellers
rejected(money-library): accounting.js — lacks sub-unit arithmetic, using currency.js instead
constraint(stripe-integration): Stripe requires currency at PaymentIntent creation, cannot change after
learned(stripe-multicurrency): presentment currency vs settlement currency are different Stripe concepts
```

## When You Lack Conversation Context

Sometimes staged changes include work you didn't produce — prior session output, another agent's changes, manual edits. For any change where you lack the reasoning trail:

**Only write action lines for what is clearly evidenced in the diff.** Do not speculate about intent or constraints you cannot observe.

What you CAN infer from a diff alone:
- `decision(scope)` — if a clear technical choice is visible (new dependency added, pattern adopted)

What you CANNOT infer — do not fabricate:
- `intent(scope)` — why the change was made is not in the diff
- `rejected(scope)` — what was NOT chosen is invisible in what WAS committed
- `constraint(scope)` — hard limits are almost never visible in code changes
- `learned(scope)` — learnings come from the process, not the output

**A clean conventional commit subject with no action lines is always better than fabricated context.**

## Rules

1. **The subject line is a Conventional Commit.** Never break existing conventions or tooling.
2. **Action lines go in the body only.** Never in the subject line.
3. **Only write action lines that carry signal.** If the diff already explains it, don't repeat it.
4. **Use lowercase for action line descriptions.** No sentence case.
5. **Use codegraph aliases as scopes when available.** Fall back to module IDs only when no alias exists.
6. **Validate all scopes against the codegraph.** Every scope must be a valid alias or module ID.
7. **Omit `root` scope from the subject line.** Keep it in body action lines for filtering.
8. **Capture the user's intent in their words.** For `intent` lines, reflect what the human asked for.
9. **Always explain why for `rejected` lines.** A rejection without a reason is useless.
10. **Don't invent action lines for trivial commits.** A typo fix or dependency bump needs no action lines.
11. **Don't fabricate context you don't have.** See "When You Lack Conversation Context" above.
12. **Don't duplicate reasoning from prior commits.** Check branch history first. Each commit adds new signal to the timeline, not a restated summary.
13. **Prefer an empty body over noise.** A subject-only commit is a valid contextual commit. Not every change produces reasoning worth capturing.
