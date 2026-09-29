#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

source "$SCRIPT_DIR/env.sh"

echo "KRYPHOS Solana 2.1.0 dependency pin + SBF build"
echo "This does NOT start or restart the website."
echo

rm -f Cargo.lock
cargo generate-lockfile

echo
echo "Resolved critical versions:"
cargo tree -p kryphos-burn --depth 2 | grep -E \
  'anchor-lang v|anchor-spl v|solana-program v|pyth-solana-receiver-sdk v|pythnet-sdk v|block-buffer v|base64ct v' \
  || true

if grep -A1 '^name = "block-buffer"$' Cargo.lock | grep -q '^version = "0\.12\.'; then
  echo
  echo "ERROR: incompatible block-buffer 0.12.x is still present."
  echo "Dependency chain:"
  cargo tree -i block-buffer@0.12.1 || true
  exit 1
fi

anchor keys sync
anchor build -- --locked

node "$SCRIPT_DIR/preflight.mjs"

echo
echo "Build complete."
echo "Program ID:"
anchor keys list
echo
echo "Artifacts:"
ls -lh target/deploy/kryphos_burn.so target/idl/kryphos_burn.json
