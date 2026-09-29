#!/usr/bin/env bash
set -euo pipefail

echo "Installing KRYPHOS Solana build tools."
echo "This script does NOT start or restart the website."

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
source "$HOME/.cargo/env"

# Anchor 0.31.1 is intentionally pinned because the Pyth receiver dependency
# used by the on-chain program is compatible with Anchor 0.31.1.
if ! command -v avm >/dev/null 2>&1; then
  cargo install --git https://github.com/solana-foundation/anchor avm --force
fi
avm install 0.31.1 --from-source
avm use 0.31.1

if ! command -v solana >/dev/null 2>&1; then
  sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
fi

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

npm install

echo
echo "Installed:"
rustc --version
cargo --version
solana --version
anchor --version
node --version
