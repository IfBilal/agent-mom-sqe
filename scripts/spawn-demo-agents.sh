#!/usr/bin/env bash
# Spawns the four-agent demo topology against an already-running control plane.
set -euo pipefail
BASE="${1:-http://localhost:4000}/api"
curl -sf -XPOST "$BASE/admin/spawn-demo" | python3 -m json.tool || {
  echo "control plane not reachable at $BASE" >&2
  exit 1
}
echo "demo topology: agent-A (standard), agent-B (standard, group alpha),"
echo "               agent-C (standard, groups alpha+beta, component-controlled),"
echo "               agent-D (key-holder, group alpha)"
