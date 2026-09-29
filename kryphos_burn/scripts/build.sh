#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

source "$SCRIPT_DIR/env.sh"

echo "KRYPHOS dependency repair + SBF build"
echo "This does NOT start or restart the website."
echo

# Recreate the lockfile from the exact dependency pins.
rm -f Cargo.lock
cargo generate-lockfile

echo
echo "Resolved critical versions:"
cargo tree -p kryphos-burn --depth 2 | grep -E \
  'anchor-lang v|anchor-spl v|pyth-solana-receiver-sdk v|pythnet-sdk v|block-buffer v|base64ct v' \
  || true

# Stop before Anchor compilation if the known incompatible Rust-2024
# block-buffer 0.12.x somehow appears again.
if grep -A1 '^name = "block-buffer"$' Cargo.lock \
  | grep -q '^version = "0\.12\.'; then
  echo
  echo "ERROR: incompatible block-buffer 0.12.x is still present in Cargo.lock."
  echo "Build stopped before Anchor/SBF compilation."
  exit 1
fi

anchor keys sync

# Anchor 0.31.1 requires Cargo/SBF arguments after `--`.
anchor build -- --locked

node "$SCRIPT_DIR/preflight.mjs"

echo
echo "Build complete."
echo "Program ID:"
anchor keys list
echo
echo "Artifacts:"
ls -lh target/deploy/kryphos_burn.so target/idl/kryphos_burn.json
