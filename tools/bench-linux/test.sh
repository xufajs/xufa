#!/bin/bash
# Runs the tests of packages in the copy of the repository (~/xufa, made by setup.sh), with Node.js for Linux.
# test.sh <version of Node.js (v22.21.1)> <package>...
# A summary of each package and its failed tests; the exit status is 1 when one failed.
set -uo pipefail
VERSION="$1"
shift
export PATH="$HOME/node-$VERSION/bin:$PATH"
failed=""
for p in "$@"; do
  cd ~/xufa/packages/"$p" || exit 1
  # (The runner of the workspace: what node_modules/@xufa/test links to, and @xufa/test itself has no such link.)
  out=$(node ~/xufa/packages/test/bin/xufa-test.js 2>&1)
  status=$?
  echo "== $p: $(echo "$out" | grep -E 'Tests  ' | tail -1 | sed -E 's/^ +//')"
  echo "$out" | grep -E '^ +× ' | head -20
  if [ $status -ne 0 ]; then failed="$failed $p"; fi
done
if [ -n "$failed" ]; then
  echo "failed:$failed"
  exit 1
fi
