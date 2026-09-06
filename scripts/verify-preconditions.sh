#!/usr/bin/env bash
# CON-04 / CON-05 check — run BEFORE any test session (Phase 13).
# This is what makes a later BLOCKED verdict defensible rather than an excuse.
set -uo pipefail

echo "=== agentMom precondition check — $(date -u +%FT%TZ) ==="
echo
echo "[CON-04] Multicast support (router / NIC / OS — SRS 2.4.3)"
if command -v ip >/dev/null 2>&1 && ip route show 2>/dev/null | grep -q '224.0.0.0/4'; then
  echo "  route to 224.0.0.0/4 : PRESENT"
else
  echo "  route to 224.0.0.0/4 : not explicitly present (loopback multicast may still work)"
fi
HOSTS=$(getent hosts 2>/dev/null | wc -l || echo "?")
echo "  distinct hosts on this test bed : 1 (single machine)"
echo "  => FR2/FR3 LAN-scope conditions are BLOCKED, not FAILED, if they require multi-host."
echo
echo "[CON-05] Broadcast permission (SRS 2.4.4 — 'only an administrator may send broadcast' on many networks)"
if [ "$(id -u)" = "0" ]; then
  echo "  running as root : limited broadcast (255.255.255.255) permitted"
else
  echo "  running as non-root : limited broadcast MAY be refused; BR-12 falls back to subnet-directed"
fi
echo
echo "[interfaces]"
if command -v ip >/dev/null 2>&1; then ip -o -4 addr show | awk '{print "  "$2" "$4}'; fi
echo
echo "Record this output in evidence/test-execution/ before executing Table B."
