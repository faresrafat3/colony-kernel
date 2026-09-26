#!/usr/bin/env bash
# Publish the landing site (docs/site) to the gh-pages branch in one command.
# Gates: R3 — refuses to publish unless `npm run verify` is green on this exact
# tree, and refuses a dirty working tree. The demo JSON served on the site is
# regenerated here, so the page always shows a run this machine just produced.
#
# Usage: bash scripts/publish-site.sh
set -euo pipefail
cd "$(dirname "$0")/.."

LIVE_URL="https://faresrafat3.github.io/colony-kernel/"

[ -z "$(git status --porcelain)" ] || { echo "refusing: working tree is dirty — commit or stash first" >&2; exit 1; }

echo "== gate: verify (typecheck + lint + 67 tests + byte-identical demo) =="
npm run -s verify | tail -1

echo "== regenerate demo.json =="
npm run -s demo > docs/site/demo.json
node -e 'JSON.parse(require("fs").readFileSync("docs/site/demo.json","utf8"))'
echo "demo.json: valid JSON, $(wc -c < docs/site/demo.json) bytes"

echo "== publish docs/site -> gh-pages =="
WORK="$(mktemp -d)"
cleanup() { git worktree remove --force "$WORK" 2>/dev/null || true; }
trap cleanup EXIT

if git show-ref --verify --quiet refs/heads/gh-pages; then
  git worktree add "$WORK" gh-pages
  git -C "$WORK" rm -rfq .
else
  git worktree add --orphan -b gh-pages "$WORK"
fi
cp docs/site/index.html docs/site/demo.json "$WORK/"
touch "$WORK/.nojekyll"
git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
  echo "gh-pages already up to date"
else
  git -C "$WORK" commit -qm "Publish site: demo.json regenerated from a verified tree" \
    --author="faresrafat3 <faresrafat3@gmail.com>"
  git push origin gh-pages
fi

echo "live: $LIVE_URL"
