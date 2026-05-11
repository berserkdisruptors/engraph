---
name: context-add
description: >-
  Add new knowledge to the context repository. Classifies the input as a
  convention or verification rule, determines which codegraph modules it
  applies to, grounds it with real codebase examples, and creates a
  structured context file with bridge fields.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# Add Context to Repository

Add a single piece of knowledge to the Engraph context repository. Creates a convention or verification file with bridge fields scoped to codegraph modules.

User input:

$ARGUMENTS

---

## Step 0: Prerequisites

Ensure fresh codegraph and context index:

```bash
engraph graph
```

Read `.engraph/codegraph/index.yaml` — you'll need this for module ID resolution.

**If `$ARGUMENTS` is empty:** Ask the user what knowledge they'd like to add. STOP and wait.

---

## Step 1: Understand and Classify

Parse `$ARGUMENTS` — the natural language description of the knowledge to add.

Classify into one of two domains:

| Domain | Signal | Examples |
|--------|--------|----------|
| **Convention** | Describes HOW to do things — patterns, standards, rules for writing code | "Always use typed responses", "Follow repository pattern for DB access", "Use kebab-case for file names" |
| **Verification** | Describes HOW to verify correctness — testing procedures, quality gates, review checklists, known risks | "Every PR needs tests", "Watch out for N+1 queries in UserService", "Run build before e2e tests" |

Conventions describe **what to do**. Verification describes **how to know it's right**.

When ambiguous, explain your reasoning to the user.

---

## Step 2: Determine Module Scope

Determine which codegraph modules this knowledge applies to. This becomes the `applies_to_modules` (conventions) or `triggered_by_modules` (verification) bridge field.

**How to determine:**
1. Read the codegraph index for the module list
2. If the user's knowledge mentions specific areas (e.g., "for the auth module", "in templates"), map those to module IDs
3. If the knowledge is global (e.g., "all files should use .yaml extension"), use `["*"]`
4. If unclear, ask the user which modules this applies to

**Use aliases when available** in your communication with the user (e.g., "Does this apply to `codegraph` or all `commands/*`?"), but store full module IDs or glob patterns in the bridge field.

---

## Step 3: Check for Existing Context

Before creating, scan existing context files to avoid duplication.

1. Run `engraph lookup` for the affected modules to see what conventions/verification already exist:
   ```bash
   engraph lookup <module-ids...>
   ```
2. If a closely matching item exists:
   - Read the existing file
   - Ask the user whether to **update/merge** into the existing file or **create a new** separate entry
   - STOP and wait for user response

---

## Step 4: Ground in Codebase

Search for real files that relate to this knowledge:

- Use Glob and Grep to find files that demonstrate the pattern
- Read relevant files to find code snippets as examples
- For conventions: look for existing violations if applicable
- For verification: find test files, CI configs, or areas the risk applies to

Collect:
- **Reference files**: Real file paths
- **Examples**: Code snippets showing the pattern
- **Violations** (conventions only): Counter-examples if they exist

---

## Step 5: Create Context File

Create a YAML file following the appropriate schema.

### File naming
- kebab-case, semantic, max 50 characters
- Place in: `.engraph/context/{conventions|verification}/`

### Convention file template

```yaml
id: {kebab-case-id}
name: "{Human Readable Name}"
type: convention
sub_type: {code-convention|architectural-pattern|naming-convention|testing-standard|dependency-rule|security-requirement|performance-guideline|project-quirk}
enforcement: {strict|recommended|reference}
applies_to_modules:
  - {module-id-or-glob}
provenance: manual
created: "{today YYYY-MM-DD}"
last_updated: "{today YYYY-MM-DD}"

description: |
  {Multi-line description of the convention}

# Optional: examples, violations, reference_files, template
```

### Verification file template

```yaml
id: {kebab-case-id}
name: "{Human Readable Name}"
type: verification
triggered_by_modules:
  - {module-id-or-glob}
provenance: manual
created: "{today YYYY-MM-DD}"
last_updated: "{today YYYY-MM-DD}"

description: |
  {Multi-line description}

# Optional: verification_procedures, known_risks, expected_outcomes
```

### Writing
- If creating new: use Write
- If merging into existing (from Step 3): use Edit to merge new content — preserve existing sections, append to lists, update outdated content

---

## Step 6: Regenerate Index

Run `engraph graph` to regenerate the context index with the new file:

```bash
engraph graph
```

This picks up the new file's bridge fields and adds it to `index.yaml` automatically.

---

## Step 7: Present Summary

Output a brief summary:

**For new entries:**
```
Context added: {conventions|verification}/{filename}.yaml
  Classification: {type} ({sub_type if convention}, {enforcement if convention})
  Applies to: {module list or "*"}
  Grounded with: {N} reference files, {N} examples
```

**For merged entries:**
```
Context updated: {conventions|verification}/{filename}.yaml
  Merged: {description of what was added}
```
