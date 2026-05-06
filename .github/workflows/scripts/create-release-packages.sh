#!/usr/bin/env bash
set -euo pipefail

# create-release-packages.sh (workflow-local)
# Build Engraph template release archives for each supported AI agent.
# Usage: .github/workflows/scripts/create-release-packages.sh <version>
#   Version argument should include leading 'v'.
#   Optionally set AGENTS env var to limit what gets built.
#     AGENTS  : space or comma separated subset of: universal claude pi (default: all)
#   Examples:
#     AGENTS=claude $0 v0.2.0
#     AGENTS="universal,pi" $0 v0.2.0

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version-with-v-prefix>" >&2
  exit 1
fi
NEW_VERSION="$1"
if [[ ! $NEW_VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must look like v0.0.0" >&2
  exit 1
fi

echo "Building release packages for $NEW_VERSION"

# Create and use .genreleases directory for all build artifacts
GENRELEASES_DIR=".genreleases"
mkdir -p "$GENRELEASES_DIR"
rm -rf "$GENRELEASES_DIR"/* || true

generate_skills() {
  local agent=$1 output_dir=$2
  mkdir -p "$output_dir"

  # Skills are stored as directories containing SKILL.md
  for skill_dir in src/templates/skills/*/; do
    [[ -d "$skill_dir" ]] || continue
    local skill_file="$skill_dir/SKILL.md"
    [[ -f "$skill_file" ]] || continue

    local skill_name agents_field
    skill_name=$(basename "$skill_dir")

    # Normalize line endings and read SKILL.md
    file_content=$(tr -d '\r' < "$skill_file")

    # Check for agent-specific filtering via 'agents:' field in SKILL.md frontmatter
    # If 'agents:' field exists, only include if current agent is in the list
    agents_field=$(printf '%s\n' "$file_content" | awk '/^agents:/ {sub(/^agents:[[:space:]]*/, ""); print; exit}' 2>/dev/null || true)
    if [[ -n "$agents_field" ]]; then
      # Use word boundary matching for reliable agent name detection
      if ! echo "$agents_field" | grep -qw "$agent"; then
        echo "  [filter] Skipping skill $skill_name for $agent (agents: $agents_field)"
        continue
      else
        echo "  [filter] Including skill $skill_name for $agent (agents: $agents_field)"
      fi
    fi

    # Copy the entire skill directory structure (preserves all files in the skill folder)
    local dest_skill_dir="$output_dir/$skill_name"
    mkdir -p "$dest_skill_dir"
    cp -r "$skill_dir"/* "$dest_skill_dir/"
    echo "  Copied skill: $skill_name -> $dest_skill_dir"
  done
}

build_package() {
  local agent=$1
  local base_dir="$GENRELEASES_DIR/sdd-${agent}-package"
  echo "Building $agent package..."
  mkdir -p "$base_dir"

  # Copy base structure
  SPEC_DIR="$base_dir/.engraph"
  mkdir -p "$SPEC_DIR"

  [[ -d memory ]] && { cp -r memory "$SPEC_DIR/"; echo "Copied memory -> .engraph"; }

  if [[ -d src/context ]]; then
    mkdir -p "$SPEC_DIR/context"
    cp -r src/context/* "$SPEC_DIR/context/"
    echo "Copied src/context -> .engraph/context"
  fi
  case $agent in
    universal)
      if [[ -d src/templates/skills ]]; then
        mkdir -p "$base_dir/.agents/skills"
        generate_skills universal "$base_dir/.agents/skills"
      fi
      ;;
    claude)
      if [[ -d src/templates/skills ]]; then
        mkdir -p "$base_dir/.claude/skills"
        generate_skills claude "$base_dir/.claude/skills"
      fi
      ;;
    pi)
      if [[ -d src/templates/skills ]]; then
        mkdir -p "$base_dir/.pi/skills"
        generate_skills pi "$base_dir/.pi/skills"
      fi
      ;;
  esac
  ( cd "$base_dir" && zip -r "../engraph-template-${agent}-${NEW_VERSION}.zip" . )
  echo "Created $GENRELEASES_DIR/engraph-template-${agent}-${NEW_VERSION}.zip"
}

# Determine agent list
ALL_AGENTS=(universal claude pi)

norm_list() {
  # convert comma+space separated -> space separated unique while preserving order of first occurrence
  tr ',\n' '  ' | awk '{for(i=1;i<=NF;i++){if(!seen[$i]++){printf((out?" ":"") $i)}}}END{printf("\n")}'
}

validate_subset() {
  local type=$1; shift; local -n allowed=$1; shift; local items=("$@")
  local ok=1
  for it in "${items[@]}"; do
    local found=0
    for a in "${allowed[@]}"; do [[ $it == "$a" ]] && { found=1; break; }; done
    if [[ $found -eq 0 ]]; then
      echo "Error: unknown $type '$it' (allowed: ${allowed[*]})" >&2
      ok=0
    fi
  done
  [[ $ok -eq 1 ]]
}

if [[ -n ${AGENTS:-} ]]; then
  mapfile -t AGENT_LIST < <(printf '%s' "$AGENTS" | norm_list)
  validate_subset agent ALL_AGENTS "${AGENT_LIST[@]}" || exit 1
else
  AGENT_LIST=("${ALL_AGENTS[@]}")
fi

echo "Agents: ${AGENT_LIST[*]}"

for agent in "${AGENT_LIST[@]}"; do
  build_package "$agent"
done

echo "Archives in $GENRELEASES_DIR:"
ls -1 "$GENRELEASES_DIR"/engraph-template-*-"${NEW_VERSION}".zip
