#!/usr/bin/env bash
set -euo pipefail
source "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

anchor keys sync
anchor build
node scripts/preflight.mjs

echo
echo "Build complete."
echo "Program ID:"
anchor keys list
