#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

CLUSTER="${1:-devnet}"
RPC="${SOLANA_RPC_URL:-}"

if [[ "$CLUSTER" != "devnet" && "$CLUSTER" != "mainnet" ]]; then
  echo "Usage: ./scripts/deploy.sh devnet|mainnet"
  exit 1
fi

if [[ -z "$RPC" ]]; then
  if [[ "$CLUSTER" == "devnet" ]]; then
    RPC="https://api.devnet.solana.com"
  else
    echo "For mainnet set SOLANA_RPC_URL to your reliable HTTPS Solana RPC."
    exit 1
  fi
fi

if [[ "$CLUSTER" == "mainnet" ]]; then
  echo "MAINNET deployment selected."
  echo "Program deployment spends real SOL."
  read -r -p "Type MAINNET to continue: " CONFIRM
  [[ "$CONFIRM" == "MAINNET" ]] || exit 1
fi

solana config set --url "$RPC" >/dev/null
anchor keys sync
anchor build
anchor deploy --provider.cluster "$RPC"

echo
echo "Deployed to $CLUSTER"
anchor keys list
