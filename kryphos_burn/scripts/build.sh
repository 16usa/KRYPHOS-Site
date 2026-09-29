#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

source "$SCRIPT_DIR/env.sh"

echo "KRYPHOS Pyth/Solana dependency unification + SBF build"
echo "This does NOT start or restart the website."
echo

# Recreate the lockfile from the pinned KRYPHOS dependencies.
rm -f Cargo.lock
cargo generate-lockfile

# pythnet-sdk 2.3.1 intentionally declares very broad optional ranges:
#   anchor-lang >=0.28.0
#   solana-program >=1.13.6
# In 2026 Cargo therefore resolves a second, much newer graph
# (Anchor 1.x + Solana 5.x), even though KRYPHOS itself is pinned to
# Anchor 0.31.1 + Solana 2.1.0. Both older versions satisfy pythnet's
# declared ranges, so force that transitive branch onto the same graph.
if cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -q 'anchor-lang v1\.'; then
  echo "Unifying pythnet-sdk anchor-lang -> 0.31.1"
  cargo update -p anchor-lang@1.2.0 --precise 0.31.1
fi

if cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -q 'solana-program v5\.1\.0'; then
  echo "Unifying pythnet-sdk solana-program -> 2.1.0"
  cargo update -p solana-program@5.1.0 --precise 2.1.0
fi

echo
echo "Resolved Pyth branch:"
cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -E \
  'pythnet-sdk|anchor-lang v|solana-program v|sha2 v|blake3 v|block-buffer v' \
  || true

# Refuse to enter SBF compilation if a second future Anchor/Solana graph
# or the known Rust-2024 block-buffer is still present.
if cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -q 'anchor-lang v1\.'; then
  echo "ERROR: pythnet-sdk still resolves Anchor 1.x."
  exit 1
fi

if cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -q 'solana-program v5\.'; then
  echo "ERROR: pythnet-sdk still resolves Solana program 5.x."
  exit 1
fi

if grep -A1 '^name = "block-buffer"$' Cargo.lock | grep -q '^version = "0\.12\.'; then
  echo "ERROR: incompatible block-buffer 0.12.x is still present."
  echo "Dependency chain:"
  cargo tree -i block-buffer@0.12.1 --depth 5 || true
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
