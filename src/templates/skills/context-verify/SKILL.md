---
name: context-verify
description: >-
  Verify current branch changes against the context repository. Maps changed
  files to codegraph modules, loads scoped conventions and verification
  procedures, checks historical constraints from contextual commits, and
  executes verification steps. Produces a structured report with findings.
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Verify Changes Against Context Repository

Verify the current branch's changes against conventions, verification procedures, and historical constraints scoped to the affected codegraph modules.

This skill does three things:
1. **Convention compliance** (static): Check changes against naming patterns, structure rules, anti-patterns.
2. **Verification execution** (active): Run matched verification procedures — build steps, test commands, output inspection.
3. **Historical constraint check**: Surface decisions, rejections, and constraints from contextual commit history that the changes must respect.

User input:

$ARGUMENTS

---

## Step 0: Collect Changed Files

1. Verify we're in a git repo:
```bash
git rev-parse --is-inside-work-tree
```

2. Collect changed files using **either/or** logic:

**Check for staged/unstaged changes first:**
```bash
git diff --name-only
git diff --cached --name-only
```

If non-empty (combined, deduplicated), these are the changes to verify (**pre-commit mode**). Get the diff:
```bash
git diff
git diff --cached
```

**If working tree is clean**, fall back to committed changes against base branch:
```bash
git diff main...HEAD --name-only
git diff main...HEAD
```

If `$ARGUMENTS` specifies a base branch (e.g., "against develop"), use that instead of `main`.

3. **Exclude** files under `.engraph/` — the context repository itself is out of scope.

**If no changes found:** Tell the user "No changes to verify." and STOP.

---

## Step 1: Regenerate and Map to Modules

Run `engraph graph` to ensure fresh codegraph and context index:

```bash
engraph graph
```

Then read `.engraph/codegraph/index.yaml` and map each changed file to its codegraph module ID. Follow `sub_graph` references for deeper resolution.

**How to map:** A file at `src/commands/graph/scanner.ts` belongs to module `commands/graph`. Strip the source root prefix (`src/`) and match to the module whose `path` contains the file.

Collect the deduplicated set of affected module IDs.

---

## Step 2: Load Scoped Context

### 2A: Conventions and Verification

Run `engraph lookup` with the affected module IDs:

```bash
engraph lookup <module-id-1> <module-id-2> ...
```

This returns:
- **conventions** — scoped to the affected modules
- **verification** — procedures triggered by changes to those modules
- **global_conventions** — conventions that apply to all modules

### 2B: Historical Constraints

Run `engraph recall` filtered to constraints and rejections:

```bash
engraph recall <module-id-1> <module-id-2> ... --filter constraint,rejected
```

This returns contextual commit history with:
- **constraint** — hard limits that shaped past implementations
- **rejected** — approaches that were tried and explicitly discarded (with reasons)

These are critical for catching regressions — if the current changes re-introduce a rejected approach or violate a known constraint, that's a finding.

---

## Step 3: Convention Compliance (Static Checks)

For each convention returned by lookup (scoped + global), check the diff content and changed files:

- **Naming**: File names against required patterns (kebab-case, prefixes, extensions). Variable/function names in new code lines.
- **Structure**: Required fields in config/template files. Directory placement. File extensions.
- **Anti-patterns**: Explicitly listed violation patterns. Compare new code against documented examples.

Classify each finding:
- **violation**: A `strict` rule is clearly broken
- **warning**: A `recommended` rule may not be followed, or changes are in a documented risk zone
- **pass**: The rule was checked and changes comply

### Historical Constraint Check

For each constraint and rejection from recall:
- Check if the current changes re-introduce a rejected approach
- Check if the changes violate a documented constraint
- Flag as **violation** if a clear match, **warning** if potentially related

---

## Step 4: Execute Verification Procedures

For each verification procedure returned by lookup, **execute the verification steps** — do not just list them.

For each applicable verification file:

1. Read the procedure steps (`verification_procedures`, `test_execution`)
2. Match changed files against the verification scope to determine which steps apply
3. **Run each applicable step:**
   - Execute the command (e.g., `npm run build`, `npx tsc --noEmit`, `npm run test:unit`)
   - Check the output against the expected result
   - Record pass or fail

4. For `test_execution.module_test_map` entries: determine which test tiers to run based on the changed modules. Run the selective test commands.

5. For `known_risks` entries: flag when changes touch modules with documented risks. Surface the risk description and mitigation as a **warning**.

**If a step fails:** Record the failure, continue with remaining steps. Do not stop on first failure.

---

## Step 5: Generate Report

Output the verification report:

```
## Verification Report

Branch: `{current-branch}` {→ `{base-branch}` or "(uncommitted changes)"}
Modules checked: {module-id-1, module-id-2, ...}
Files changed: {N} | Conventions checked: {C} | Verification procedures run: {V} | Historical constraints checked: {H}

---

### Convention Violations ({count})

{For each violation:}
N. **{rule-name}** ({enforcement}) - `{file-path}`
   Rule: {what the rule requires}
   Found: {what the diff shows}
   Fix: {specific action to fix}

### Convention Warnings ({count})

{For each warning:}
N. **{rule-name}** - `{file-path}`
   Risk: {description}

### Historical Constraint Violations ({count})

{For each constraint/rejection match:}
N. **{constraint description}** (from commit {hash})
   Module: {module-id}
   Issue: {how the current changes conflict}

### Conventions Passed ({count})

- **{rule-name}** -- {brief check description}

---

### Verification Results

{For each executed procedure:}
N. **{procedure-name}**
   Triggered by: {changed modules}
   {For each step:}
   - [x] {step}: {pass description}  OR
   - [ ] {step}: FAILED — {error output summary}

### Verification Warnings ({count})

{For each known-risk warning:}
N. **{risk-name}** - `{module}`
   Risk: {description}
   Mitigation: {guidance}
```

If a section has zero items, show the heading with (0) and no items.

### Structured JSON Output

After the human-readable report, output a JSON block:

```json
{
  "status": "pass | fail | warn",
  "modules_checked": ["module-id-1", "module-id-2"],
  "conventions_applied": 5,
  "verification_procedures_run": 2,
  "historical_constraints_checked": 3,
  "findings": [
    {
      "severity": "fail | warn | info",
      "type": "convention | verification | constraint",
      "file": "src/auth/providers/google.ts",
      "module": "auth/providers",
      "rule_id": "error-handling",
      "description": "Error in OAuth callback not wrapped in ErrorResponse",
      "suggestion": "Wrap the catch block with ErrorResponse.from(error)"
    }
  ]
}
```

Status is `fail` if any violations exist, `warn` if only warnings, `pass` if all clean.

---

## Step 6: Summary

- **Violations found**: "Found {N} violation(s). Review the report above."
- **Verification failures**: "Found {V} verification failure(s). Fix the failing steps."
- **Only warnings**: "No violations. {W} warning(s) to be aware of."
- **All clean**: "All conventions passed. All verification steps succeeded. Changes look good."

---

## Error Handling

| Scenario | Message |
|----------|---------|
| Not a git repo | "Not in a git repository." |
| Base branch not found | "Base branch `{name}` not found. Specify: `/context-verify against develop`" |
| No changes detected | "No changes to verify." |
| engraph graph fails | "Failed to regenerate codegraph. Check for errors." |
| No conventions or verification in context | "Context repository has no conventions or verification rules. Use `/context-add` to add some." |
