#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

echo "Installing KRYPHOS Solana build tools into:"
echo "  $KRYPHOS_TOOL_ROOT"
echo
echo "This script does NOT start or restart the website."
echo "It does NOT modify /home/runner/.bashrc."

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --no-modify-path
fi

rustup default stable

if ! command -v avm >/dev/null 2>&1; then
  cargo install --git https://github.com/otter-sec/anchor avm --force --locked
fi

# Anchor 0.31.x supports AVM binary installs on x86_64 Linux.
avm install 0.31.1
avm use 0.31.1

if ! command -v solana >/dev/null 2>&1; then
  # HOME points to the writable KRYPHOS project-local tooling directory.
  sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
fi

npm install

echo
echo "Installed versions:"
rustc --version
cargo --version
solana --version
anchor --version
node --version

echo
echo "Toolchain installation complete."
echo "For future Shell checks use:"
echo "  source scripts/env.sh"
