#!/bin/zsh
set -e
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Install Node.js 22, then run this again."; exit 1; }
for source_file in *.js functions/*.js tests/*.mjs; do
  node --check "$source_file"
done
node tests/offline.mjs
echo "Syntax and offline checks passed. Live services still need acceptance testing."
