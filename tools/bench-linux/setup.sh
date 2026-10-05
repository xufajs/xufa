#!/bin/bash
# Makes a copy of the repository in the home of a Linux of WSL, with Node.js for Linux, to run the benchmarks there.
# setup.sh <repository, as a path of Linux (/mnt/c/...)> <version of Node.js (v22.21.1)>
# The node_modules of Windows do not work in Linux: the copy has its own, installed when the lockfile changes.
set -euo pipefail
REPO="$1"
VERSION="$2"
NODE_DIR=~/node-$VERSION
COPY=~/xufa

if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "bench-linux: installing Node.js $VERSION in $NODE_DIR"
  mkdir -p "$NODE_DIR"
  curl -sSfL "https://nodejs.org/dist/$VERSION/node-$VERSION-linux-x64.tar.xz" | tar -xJ -C "$NODE_DIR" --strip-components=1
fi
export PATH="$NODE_DIR/bin:$PATH"

# The working tree as it is (changes not committed too), without node_modules nor the history.
mkdir -p "$COPY"
tar -C "$REPO" --exclude=node_modules --exclude=.git --exclude='*.cpuprofile' -cf - . | tar -C "$COPY" -xf -

cd "$COPY"
LOCK_HASH=$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat .bench-linux-lock 2>/dev/null)" != "$LOCK_HASH" ]; then
  echo "bench-linux: installing the dependencies"
  PNPM_VERSION=$(node -e "const p=require('./package.json');console.log((p.packageManager||'pnpm@10').split('@')[1])")
  corepack enable --install-directory "$NODE_DIR/bin" pnpm >/dev/null 2>&1 || true
  corepack prepare "pnpm@$PNPM_VERSION" --activate >/dev/null 2>&1 || npm install -g "pnpm@$PNPM_VERSION" >/dev/null
  pnpm install --frozen-lockfile >/dev/null
  echo "$LOCK_HASH" > .bench-linux-lock
fi
