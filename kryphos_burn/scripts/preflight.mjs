import fs from "node:fs";
import { execFileSync } from "node:child_process";

const files = [
  "Anchor.toml",
  "Cargo.toml",
  "programs/kryphos_burn/Cargo.toml",
  "programs/kryphos_burn/src/lib.rs",
  "package.json"
];

for (const f of files) {
  if (!fs.existsSync(f)) throw new Error(`Missing ${f}`);
}

console.log("KRYPHOS burn package files: OK");

for (const cmd of ["node", "rustc", "cargo", "solana", "anchor"]) {
  try {
    const flag = cmd === "node" ? "--version" : "--version";
    const out = execFileSync(cmd, [flag], { encoding: "utf8" }).trim();
    console.log(`${cmd}: ${out}`);
  } catch {
    console.log(`${cmd}: NOT INSTALLED`);
  }
}

console.log("");
console.log("Token logic:");
console.log("  Initial supply: 1,000,000,000");
console.log("  Locked in PDA vault: 700,000,000");
console.log("  Final supply: 300,000,000");
console.log("  Burn stages: 10 ($100K -> $1M)");
console.log("  Withdraw instruction: NONE");
console.log("  Burn caller: permissionless");
console.log("  Price source: canonical PumpSwap spot reserves + Pyth quote/USD");
console.log("  Supported Pump quote assets: SOL / USDC");
