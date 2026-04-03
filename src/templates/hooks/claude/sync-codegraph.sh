#!/bin/bash

# PostToolUse hook: Regenerate codegraph after file edits
# Keeps .engraph/_codegraph.yaml in sync during agent sessions.
# Runs silently — codegraph sync should never block the agent flow.

npx engraph graph 2>/dev/null || true

exit 0
