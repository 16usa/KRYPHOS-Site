#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

source "$SCRIPT_DIR/env.sh"

EXPECTED_PROGRAM_ID="AiAyabtePcmbsA8VSsq4JCvR2qdotL4szqbNggHYvjwS"
CLUSTER="${1:-mainnet}"

PROGRAM_KEYPAIR="$ROOT/target/deploy/kryphos_burn-keypair.json"
PROGRAM_SO="$ROOT/target/deploy/kryphos_burn.so"
DEPLOYER="${DEPLOYER_KEYPAIR:-$ROOT/.secrets/deployer.json}"

case "$CLUSTER" in
  devnet)
    RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
    ;;
  mainnet)
    RPC="${SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}"
    ;;
  *)
    echo "Usage: ./scripts/deploy.sh devnet|mainnet"
    exit 1
    ;;
esac

for F in "$PROGRAM_KEYPAIR" "$PROGRAM_SO" "$DEPLOYER" Cargo.lock; do
  [[ -f "$F" ]] || {
    echo "ERROR: Missing $F"
    exit 1
  }
done

ACTUAL_PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KEYPAIR")"
DEPLOYER_ADDRESS="$(solana-keygen pubkey "$DEPLOYER")"

[[ "$ACTUAL_PROGRAM_ID" == "$EXPECTED_PROGRAM_ID" ]] || {
  echo "ERROR: Program ID mismatch."
  exit 1
}

grep -Fq "declare_id!(\"$EXPECTED_PROGRAM_ID\")" \
  programs/kryphos_burn/src/lib.rs || {
  echo "ERROR: Source Program ID mismatch."
  exit 1
}

COUNT="$(grep -Fc "kryphos_burn = \"$EXPECTED_PROGRAM_ID\"" Anchor.toml || true)"
[[ "$COUNT" -ge 2 ]] || {
  echo "ERROR: Anchor.toml Program ID mismatch."
  exit 1
}

echo "=== DEPLOY PREFLIGHT ==="
echo "Cluster:     $CLUSTER"
echo "Program:     $ACTUAL_PROGRAM_ID"
echo "Fee payer:   $DEPLOYER_ADDRESS"
echo "Authority:   $DEPLOYER_ADDRESS"
echo "Binary:"
ls -lh "$PROGRAM_SO"
sha256sum "$PROGRAM_SO"

echo
echo "Current balance:"
solana balance "$DEPLOYER_ADDRESS" --url "$RPC"

if solana program show "$EXPECTED_PROGRAM_ID" --url "$RPC" >/dev/null 2>&1; then
  echo "Mode: UPGRADE EXISTING PROGRAM"
else
  echo "Mode: INITIAL PROGRAM DEPLOY"
fi

if [[ "$CLUSTER" == "mainnet" ]]; then
  if [[ "${KRYPHOS_CONFIRM_MAINNET:-}" != "DEPLOY" ]]; then
    echo
    echo "NO TRANSACTION HAS BEEN SENT."
    read -r -p 'Type MAINNET to deploy real funds: ' CONFIRM
    [[ "$CONFIRM" == "MAINNET" ]] || {
      echo "Cancelled."
      exit 1
    }
  fi
fi

solana program deploy "$PROGRAM_SO" \
  --program-id "$PROGRAM_KEYPAIR" \
  --upgrade-authority "$DEPLOYER" \
  --fee-payer "$DEPLOYER" \
  --keypair "$DEPLOYER" \
  --url "$RPC"

echo
echo "=== DEPLOYED PROGRAM ==="
solana program show "$EXPECTED_PROGRAM_ID" --url "$RPC"
