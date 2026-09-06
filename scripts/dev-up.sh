#!/usr/bin/env bash
# Builds the workspace, starts the control plane with the demo topology, and
# starts the Vite harness. Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> building core, agent, control-plane"
npx tsc -b packages/core packages/agent packages/control-plane

echo "==> starting control plane on :4000 with demo topology (agent-A..D)"
SPAWN_DEMO=1 CONTROL_PLANE_PORT=4000 node packages/control-plane/dist/main.js &
CP_PID=$!
trap 'kill $CP_PID 2>/dev/null || true' EXIT

sleep 2
echo "==> starting harness on http://localhost:5173"
npm --workspace @agentmom/web run dev
