import fs from "node:fs";
import path from "node:path";
import { loadDeployment } from "./lib.mjs";

const dep = loadDeployment();
const siteConfig = path.resolve("..", "kryphos_site", "config.js");

if (!fs.existsSync(siteConfig)) {
  throw new Error(`Site config not found: ${siteConfig}`);
}

const content = `window.KRYPHOS_CONFIG = {
  tokenSymbol: "KRYPHOS",
  initialSupply: 1000000000,
  lockedForBurn: 700000000,
  initialCirculating: 300000000,
  finalSupply: 300000000,

  mintAddress: "${dep.mint}",
  burnVaultTokenAccount: "${dep.vault}",
  programId: "${dep.programId}",

  rpcUrl: "${process.env.SITE_RPC_URL || "https://api.mainnet-beta.solana.com"}",
  refreshMs: 30000
};
`;

fs.writeFileSync(siteConfig, content);
console.log("Updated:", siteConfig);
console.log("Mint:", dep.mint);
console.log("Vault:", dep.vault);
console.log("Program:", dep.programId);
