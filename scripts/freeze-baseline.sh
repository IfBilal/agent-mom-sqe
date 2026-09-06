#!/usr/bin/env bash
# Phase 11 — Freeze. Tags the baseline, records the hash, zips packages/.
# From here the baseline is IMMUTABLE. Fixes discovered in Phases 12–14 go on
# main AFTER all evidence is collected. The baseline-v1 tag is never moved.
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="baseline-v1"
git add -A
git commit -m "chore: as-built baseline for freeze" || echo "(nothing to commit)"
git tag -f "$TAG"
HASH=$(git rev-parse "$TAG")

zip -qr baseline-frozen.zip packages -x '*/node_modules/*' '*/dist/*'

echo "$HASH" > evidence/BASELINE_TAG_HASH.txt
echo "Frozen. Tag $TAG = $HASH"
echo "This hash goes in every Jira defect's environment field."
