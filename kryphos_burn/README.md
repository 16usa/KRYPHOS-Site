
## Replit toolchain note

Replit may expose `/home/runner/.bashrc` as read-only. This package therefore installs
Rust, Anchor and Solana into `kryphos_burn/.tooling/` and never needs to edit the shell profile.

Use:

```bash
./scripts/install-tools.sh
./scripts/preflight.sh
```

The `.tooling/` directory is gitignored and can also contain the local Solana CLI config/wallet;
do not commit it.

# KRYPHOS Burn Program

This package implements only the burn mechanics already published on the KRYPHOS site:

- Initial supply: **1,000,000,000**
- Locked in PDA burn vault: **700,000,000**
- Final supply after all stages: **300,000,000**
- No vault withdrawal instruction
- Permissionless burn execution
- Ten sequential market-cap milestones:
  - $100K -> burn 100M
  - $200K -> burn 95M
  - $300K -> burn 90M
  - $400K -> burn 80M
  - $500K -> burn 75M
  - $600K -> burn 70M
  - $700K -> burn 60M
  - $800K -> burn 50M
  - $900K -> burn 40M
  - $1M -> burn 40M

## How the milestone is verified

The program does not trust a number sent by the caller.

After the Pump.fun token graduates, `bind_canonical_pool` derives and verifies the exact canonical PumpSwap pool:
- Pump program: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- PumpSwap program: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`
- canonical pool index: `0`

`burn_next` then reads:
1. the canonical PumpSwap base/quote reserves,
2. the current token total supply,
3. the current Pyth USD price of the quote asset.

The program computes the current spot market cap itself and allows only the next stage when its threshold is reached.

This build supports both legacy SPL Token and current Pump.fun `create_v2` Token-2022 base mints, paired with **SOL or USDC**.

## Important implementation note

A Solana program cannot wake itself up. `burn_next` is permissionless, so anybody can execute it once the milestone is reached. `scripts/keeper.mjs` is included if you want an always-on caller. The keeper has no authority over the burn vault; it only pays network fees and submits `burn_next`.

## Before using real funds

1. Deploy and test on devnet.
2. Confirm the vault receives exactly 700M.
3. Confirm there is no withdrawal instruction in the IDL.
4. Test pool binding and burn stages.
5. Audit the program.
6. Only then deploy to mainnet.
7. After final review, remove the program upgrade authority if you want the deployed code to become immutable.

## Tool installation

```bash
./scripts/install-tools.sh
```

## Build

```bash
./scripts/build.sh
```

`anchor keys sync` generates/synchronizes the program ID. The program keypair in `target/deploy` must never be committed.

## Deploy devnet

```bash
export SOLANA_RPC_URL="YOUR_DEVNET_RPC"
./scripts/deploy.sh devnet
```

## Deploy mainnet

Use a reliable mainnet RPC:

```bash
export SOLANA_RPC_URL="YOUR_MAINNET_RPC"
./scripts/deploy.sh mainnet
```

The script requires typing `MAINNET` before deployment.

## Initialize the 700M vault

The wallet running this command must own at least 700,000,000 tokens in its associated token account.

For a SOL-paired Pump.fun launch:

```bash
export KRYPHOS_CLUSTER=mainnet
export SOLANA_RPC_URL="YOUR_MAINNET_RPC"
node scripts/initialize-vault.mjs <MINT> So11111111111111111111111111111111111111112
```

For a USDC-paired Pump.fun launch:

```bash
node scripts/initialize-vault.mjs <MINT> EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

## Bind the canonical PumpSwap pool after graduation

```bash
node scripts/bind-pool.mjs
```

This fails until the canonical migrated PumpSwap pool exists.

## Test one permissionless burn call

```bash
node scripts/execute-burn.mjs
```

If the next market-cap milestone has not been reached, the program rejects the transaction.

## Automatic caller / keeper

Use a dedicated keeper wallet with only a small amount of SOL for transaction fees.

```bash
export KEEPER_KEYPAIR="/path/to/keeper.json"
node scripts/keeper.mjs
```

The keeper cannot withdraw tokens from the vault.

## Status

```bash
node scripts/status.mjs
```

## Connect the existing KRYPHOS website

After mainnet initialization:

```bash
node scripts/sync-site-config.mjs
```

This writes the real Mint, Burn Vault and Program ID into `../kryphos_site/config.js`. Then commit/push that file with your normal Git workflow.

## Make the program immutable

Do this only after testing/audit and only if you intentionally want to permanently disable upgrades.

First inspect the deployed program ID:

```bash
anchor keys list
```

Then use Solana's program upgrade-authority command for your installed Solana/Agave CLI. Verify the exact command with:

```bash
solana program set-upgrade-authority --help
```

Do not run the final authority-removal command until you have verified the deployed binary and accepted that it can never be upgraded again.
