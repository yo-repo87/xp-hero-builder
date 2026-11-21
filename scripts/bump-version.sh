#!/usr/bin/env bash
# Bump every ?v=<hash> in index.html to the current commit's short hash, then commit.
# Run AFTER committing js/css changes. data/*.json fetches reuse data.js's token automatically.
set -euo pipefail
cd "$(dirname "$0")/.."
h=$(git log -1 --format=%h)
sed -i -E "s/\?v=[a-z0-9]+/?v=$h/g" index.html
if git diff --quiet index.html; then echo "Already at $h"; exit 0; fi
git add index.html
git commit -q -m "Bump cache-busting query string to $h"
echo "Bumped to $h"
