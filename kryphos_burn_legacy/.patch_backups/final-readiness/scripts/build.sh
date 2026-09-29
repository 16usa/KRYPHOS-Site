#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

source "$SCRIPT_DIR/env.sh"

EXPECTED_PROGRAM_ID="AiAyabtePcmbsA8VSsq4JCvR2qdotL4szqbNggHYvjwS"
export CARGO_HTTP_MULTIPLEXING=false

echo "=== KRYPHOS SAFE BUILD ==="

[[ -f Cargo.lock ]] || {
  echo "ERROR: Cargo.lock missing. Refusing to regenerate it."
  exit 1
}

[[ -f target/deploy/kryphos_burn-keypair.json ]] || {
  echo "ERROR: Program keypair missing."
  exit 1
}

ACTUAL_ID="$(solana-keygen pubkey target/deploy/kryphos_burn-keypair.json)"

[[ "$ACTUAL_ID" == "$EXPECTED_PROGRAM_ID" ]] || {
  echo "ERROR: Program keypair mismatch."
  echo "Expected: $EXPECTED_PROGRAM_ID"
  echo "Actual:   $ACTUAL_ID"
  exit 1
}

grep -Fq "declare_id!(\"$EXPECTED_PROGRAM_ID\")" \
  programs/kryphos_burn/src/lib.rs || {
  echo "ERROR: declare_id mismatch."
  exit 1
}

COUNT="$(grep -Fc "kryphos_burn = \"$EXPECTED_PROGRAM_ID\"" Anchor.toml || true)"
[[ "$COUNT" -ge 2 ]] || {
  echo "ERROR: Anchor.toml Program ID mismatch."
  exit 1
}

LOCK_BEFORE="$(sha256sum Cargo.lock | awk '{print $1}')"

cargo metadata --locked --no-deps >/dev/null

echo "Program ID: $ACTUAL_ID"
echo "Cargo.lock: locked"
echo
echo "Building..."

anchor build

LOCK_AFTER="$(sha256sum Cargo.lock | awk '{print $1}')"

[[ "$LOCK_BEFORE" == "$LOCK_AFTER" ]] || {
  echo "ERROR: Cargo.lock changed during build."
  exit 1
}

[[ -f target/deploy/kryphos_burn.so ]] || {
  echo "ERROR: SBF artifact missing."
  exit 1
}

[[ -f target/idl/kryphos_burn.json ]] || {
  echo "ERROR: Anchor IDL missing."
  exit 1
}

node "$SCRIPT_DIR/preflight.mjs"

echo
echo "=== BUILD VERIFIED ==="
echo "Program: $ACTUAL_ID"
ls -lh target/deploy/kryphos_burn.so
sha256sum target/deploy/kryphos_burn.so
