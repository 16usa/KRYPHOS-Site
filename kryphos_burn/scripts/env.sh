#!/usr/bin/env bash
set -euo pipefail

KRYPHOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export KRYPHOS_TOOL_ROOT="$KRYPHOS_ROOT/.tooling"

# Replit's /home/runner shell profile can be read-only.
# Keep the complete Solana/Rust/Anchor toolchain inside the project workspace.
export HOME="$KRYPHOS_TOOL_ROOT/home"
export CARGO_HOME="$KRYPHOS_TOOL_ROOT/cargo"
export RUSTUP_HOME="$KRYPHOS_TOOL_ROOT/rustup"
export AVM_HOME="$KRYPHOS_TOOL_ROOT/avm"

mkdir -p \
  "$HOME" \
  "$CARGO_HOME" \
  "$RUSTUP_HOME" \
  "$AVM_HOME" \
  "$HOME/.config/solana"

export PATH="$CARGO_HOME/bin:$AVM_HOME/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
