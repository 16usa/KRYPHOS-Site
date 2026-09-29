#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

source "$SCRIPT_DIR/env.sh"

echo "KRYPHOS dependency repair + SBF build"
echo "This does NOT start or restart the website."
echo

# The previous failed build may have produced a lockfile that resolved
# pyth-solana-receiver-sdk 1.2.x / Anchor 0.32.x and Rust-2024 crypto crates.
# Recreate it from the exact compatible pins above.
rm -f Cargo.lock
cargo generate-lockfile

echo
echo "Resolved critical versions:"
cargo tree -p kryphos-burn --depth 2 | grep -E \
  'anchor-lang v|anchor-spl v|pyth-solana-receiver-sdk v|pythnet-sdk v|block-buffer v|base64ct v' \
  || true

# Hard fail if the lockfile still contains the known incompatible block-buffer.
if awk '
  $0 == "name = \\"block-buffer\\"" { in_block=1; next }
  in_block && $1 == "version" {
    if ($3 ~ /\\"0\\.12\\./) bad=1
    in_block=0
  }
  END { exit bad ? 0 : 1 }
' Cargo.lock; then
  echo
  echo "ERROR: incompatible block-buffer 0.12.x is still present in Cargo.lock."
  echo "Build stopped before Anchor/SBF compilation."
  exit 1
fi

anchor keys sync
anchor build --locked
node "$SCRIPT_DIR/preflight.mjs"

echo
echo "Build complete."
echo "Program ID:"
anchor keys list
echo
echo "Artifacts:"
ls -lh target/deploy/kryphos_burn.so target/idl/kryphos_burn.json
