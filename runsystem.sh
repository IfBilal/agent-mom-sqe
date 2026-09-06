#!/usr/bin/env bash
# agentMom — one-shot local runner.
# Builds everything, starts the control plane with the 4-agent demo topology,
# starts the React harness, and prints the URLs. Ctrl-C stops all of it
# (control plane, forked agents, and the harness) cleanly.
set -euo pipefail
cd "$(dirname "$0")"

CP_PORT="${CONTROL_PLANE_PORT:-4000}"
WEB_PORT="${WEB_PORT:-5173}"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

# --- free the ports we need (any stale run) --------------------------------
for p in "$CP_PORT" "$WEB_PORT" 7001 7002 7003 7004 8001 8002 8003 8004 5007 5008 9001; do
  fuser -k "${p}/tcp" "${p}/udp" >/dev/null 2>&1 || true
done
pkill -f "packages/control-plane/dist/main.js" >/dev/null 2>&1 || true
sleep 1

# --- node check -----------------------------------------------------------
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  echo "Node.js >= 20 is required (found: $(node -v 2>/dev/null || echo none))." >&2
  exit 1
fi

# --- install + build ----------------------------------------------------
if [ ! -d node_modules ] || [ ! -e node_modules/.package-lock.json ]; then
  say "installing dependencies (first run)"
  npm install
fi
say "building core + agent + control-plane"
npm run build

# --- start the control plane (spawns agent-A..D) --------------------------
say "starting control plane on http://localhost:${CP_PORT}  (+ demo topology)"
SPAWN_DEMO=1 CONTROL_PLANE_PORT="$CP_PORT" node packages/control-plane/dist/main.js &
CP_PID=$!

cleanup() {
  trap - EXIT INT TERM
  echo
  say "shutting down"
  kill "$CP_PID" >/dev/null 2>&1 || true          # cascades SIGTERM -> agents
  kill "${WEB_PID:-}" >/dev/null 2>&1 || true
  sleep 1
  # belt and braces: nothing survives, whatever the shell was signalled with
  pkill -f "packages/control-plane/dist/main.js" >/dev/null 2>&1 || true
  pkill -f "packages/agent/dist/main.js"        >/dev/null 2>&1 || true
  for p in "$CP_PORT" "$WEB_PORT" 7001 7002 7003 7004 5007 5008 9001; do
    fuser -k "${p}/tcp" "${p}/udp" >/dev/null 2>&1 || true
  done
  say "stopped."
  exit 0
}
trap cleanup EXIT INT TERM HUP

# wait for the API to answer
for _ in $(seq 1 30); do
  curl -sf "http://localhost:${CP_PORT}/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done

# --- start the harness --------------------------------------------------
say "starting harness on http://localhost:${WEB_PORT}"
npm --workspace @agentmom/web run dev -- --port "$WEB_PORT" --strictPort &
WEB_PID=$!

cat <<BANNER

  ┌──────────────────────────────────────────────────────────────┐
  │  agentMom is running                                          │
  │                                                              │
  │   Harness      →  http://localhost:${WEB_PORT}                        │
  │   REST API     →  http://localhost:${CP_PORT}/api                     │
  │   Live events  →  ws://localhost:${CP_PORT}/live                      │
  │                                                              │
  │   Agents: agent-A/B/C/D  (D = key holder)                     │
  │   Press Ctrl-C to stop everything.                            │
  └──────────────────────────────────────────────────────────────┘

BANNER

wait "$WEB_PID"
