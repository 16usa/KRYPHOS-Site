# KRYPHOS — Replit-ready one-page site

This package is intentionally dependency-free. It runs with Node.js only.

## Replit
1. Upload `KRYPHOS_Site.zip` into the existing Replit workspace.
2. In Shell run:

```bash
unzip -o KRYPHOS_Site.zip
node server.js
```

Or simply press **Run** after the files are extracted; `.replit` already points to `node server.js`.

The server uses `PORT` automatically when Replit provides one, otherwise it uses port 3000.

## What is already working
- Full-screen hero using the supplied KRYPHOS image.
- 2.5D perspective/parallax motion.
- Animated white vapor concentrated around the doorway.
- Animated water ripples/reflections at the bottom of the hero.
- Responsive desktop/iPhone layout.
- Strict monochrome information design with no header and no navigation.
- Burn schedule and supply mechanics.
- Scroll reveal animations.
- Optional live Solana supply/vault reading from JSON-RPC.

## Connect real on-chain addresses
Edit `config.js` and paste:

```js
mintAddress: "YOUR_MINT",
burnVaultTokenAccount: "YOUR_VAULT_TOKEN_ACCOUNT",
programId: "YOUR_PROGRAM_ID",
```

When configured, the page reads the real token supply and Burn Vault balance from Solana every 30 seconds and automatically marks completed burn stages based on the actual supply reduction.

Important: this ZIP is the website. It does **not** deploy a Solana program or create the immutable Burn Vault by itself. The mint, PDA/vault, burn-program logic, authority removal, and milestone/oracle rules must be deployed separately and audited before describing them as immutable on a live token.
