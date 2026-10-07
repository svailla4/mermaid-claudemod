#!/usr/bin/env bash
# Rebuilds hooks/vendor/beautiful-mermaid-ascii.js from the published npm
# package, verified against npm's integrity hash. The mod's hooks run without
# Node or npm, so the library is bundled into one ES module the hooks import.
#
# Needs curl, tar, openssl and esbuild 0.28.2 (set ESBUILD to its path, or have
# `npx` available). Run from anywhere: ./scripts/build-vendor.sh
set -euo pipefail

VERSION=1.1.3
INTEGRITY='TItrtrAyHp1vwFfFVYauWGrquouk/6SS21Aq3RsxindSYZODcN4xYrPZD6BiZRU+o5mKJzDPz9MUSMvELdylyg=='
ESBUILD_VERSION=0.28.2

root="$(cd "$(dirname "$0")/.." && pwd)"
build="$root/.vendor-build"
out="$root/hooks/vendor/beautiful-mermaid-ascii.js"

rm -rf "$build"
mkdir -p "$build"
trap 'rm -rf "$build"' EXIT

curl -fsSL -o "$build/package.tgz" "https://registry.npmjs.org/beautiful-mermaid/-/beautiful-mermaid-$VERSION.tgz"
actual="$(openssl dgst -sha512 -binary "$build/package.tgz" | base64 | tr -d '\n')"
if [ "$actual" != "$INTEGRITY" ]; then
  echo "beautiful-mermaid $VERSION does not match its npm integrity hash" >&2
  exit 1
fi

tar -xzf "$build/package.tgz" -C "$build"
mv "$build/package" "$build/beautiful-mermaid"
cp "$root/scripts/vendor-entry.ts" "$build/entry.ts"
cp "$build/beautiful-mermaid/LICENSE" "$root/hooks/vendor/LICENSE-beautiful-mermaid"

esbuild="${ESBUILD:-npx --yes esbuild@$ESBUILD_VERSION}"
# Run from the repo root so the bundle's source comments name stable paths.
cd "$root"
$esbuild .vendor-build/entry.ts --bundle --format=esm --platform=neutral --target=es2022 \
  --legal-comments=inline \
  --banner:js="// beautiful-mermaid $VERSION (MIT, Craft Docs, github.com/lukilabs/beautiful-mermaid): the ASCII renderer, the flowchart/state parser and the ER parser only. Built by scripts/build-vendor.sh with esbuild $ESBUILD_VERSION; see LICENSE-beautiful-mermaid." \
  --outfile="$out" --log-level=warning

echo "wrote $out"
