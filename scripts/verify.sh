#!/usr/bin/env bash
# The one command. R3 of GOVERNANCE.md: all gates, on the exact tree in front
# of you. Exits non-zero on the first failure. Determinism is asserted, not
# assumed: the demo must run twice with byte-identical output.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run -s typecheck
echo "gate typecheck: OK"
npm run -s lint
echo "gate lint: OK"
npm run -s test
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
npm run -s demo > "$tmp/demo-1.json"
npm run -s demo > "$tmp/demo-2.json"
diff -q "$tmp/demo-1.json" "$tmp/demo-2.json" >/dev/null
echo "gate demo: OK (byte-identical reruns, $(wc -c < "$tmp/demo-1.json") bytes)"
echo "verify: ALL GATES GREEN"
