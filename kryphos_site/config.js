window.KRYPHOS_CONFIG = {
  tokenSymbol: "KRYPHOS",
  initialSupply: 1000000000,
  lockedForBurn: 700000000,
  initialCirculating: 300000000,
  finalSupply: 300000000,

  // Paste real addresses after deploying the token / vault.
  // Leave blank and the site stays in presentation mode without inventing live data.
  mintAddress: "",
  burnVaultTokenAccount: "",
  programId: "",

  // Public Solana RPC. Replace with Helius/QuickNode/etc. for production reliability.
  rpcUrl: "https://api.mainnet-beta.solana.com",

  // Refresh on-chain supply / vault balance when addresses are configured.
  refreshMs: 30000
};
