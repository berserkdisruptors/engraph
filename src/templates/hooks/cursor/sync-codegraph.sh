#!/bin/bash

# postToolUse hook: Regenerate codegraph after file edits
# Keeps .engraph/codegraph/ in sync during agent sessions.
# Runs silently — codegraph sync should never block the agent flow.

npx engraph graph 2>/dev/null || true

exit 0
