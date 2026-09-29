#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

source "$SCRIPT_DIR/env.sh"

echo "KRYPHOS dependency unification + BLAKE3 compatibility + SBF build"
echo "This does NOT start or restart the website."
echo

rm -f Cargo.lock
cargo generate-lockfile

# Keep pythnet-sdk on the same Anchor/Solana family used by KRYPHOS.
if cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -q 'anchor-lang v1\.'; then
  echo "Unifying pythnet-sdk anchor-lang -> 0.31.1"
  cargo update -p anchor-lang@1.2.0 --precise 0.31.1
fi

if cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -q 'solana-program v5\.1\.0'; then
  echo "Unifying pythnet-sdk solana-program -> 2.1.0"
  cargo update -p solana-program@5.1.0 --precise 2.1.0
fi

# Solana 2.1.x accepts blake3 ^1.5.4. Force a Rust-2021-compatible release.
if grep -A1 '^name = "blake3"$' Cargo.lock | grep -q '^version = "1\.8\.7"'; then
  echo "Pinning blake3 1.8.7 -> 1.5.5"
  cargo update -p blake3@1.8.7 --precise 1.5.5
fi

echo
echo "Resolved critical branches:"
cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -E \
  'pythnet-sdk|anchor-lang v|solana-program v' || true
cargo tree -i blake3@1.5.5 --depth 2 || true

if cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -q 'anchor-lang v1\.'; then
  echo "ERROR: pythnet-sdk still resolves Anchor 1.x."
  exit 1
fi

if cargo tree -p pythnet-sdk@2.3.1 --depth 2 | grep -q 'solana-program v5\.'; then
  echo "ERROR: pythnet-sdk still resolves Solana program 5.x."
  exit 1
fi

if grep -A1 '^name = "blake3"$' Cargo.lock | grep -q '^version = "1\.8\.'; then
  echo "ERROR: blake3 1.8.x is still present."
  exit 1
fi

if grep -A1 '^name = "block-buffer"$' Cargo.lock | grep -q '^version = "0\.12\.'; then
  echo "ERROR: incompatible block-buffer 0.12.x is still present."
  echo "Dependency chain:"
  cargo tree -i block-buffer@0.12.1 --depth 5 || true
  exit 1
fi

# Validate that the lockfile is internally consistent before entering SBF.
# Anchor 0.31.1 forwards trailing args directly to cargo-build-sbf. On
# Solana 2.1.0, cargo-build-sbf requires its own nested `--` separator for
# Cargo-only flags such as --locked, so passing `anchor build -- --locked`
# is rejected by cargo-build-sbf. The lockfile has already been generated,
# pinned and checked above, so build normally using that resolved lockfile.
cargo metadata --locked --no-deps >/dev/null

anchor keys sync
anchor build

node "$SCRIPT_DIR/preflight.mjs"

echo
echo "Build complete."
echo "Program ID:"
anchor keys list
echo
echo "Artifacts:"
ls -lh target/deploy/kryphos_burn.so target/idl/kryphos_burn.json
