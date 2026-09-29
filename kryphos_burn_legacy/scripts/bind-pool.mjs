import fs from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  makeProgram,
  canonicalPool,
  readPoolPrefix,
  loadDeployment,
  saveDeployment,
  clusterName
} from "./lib.mjs";

const dep = loadDeployment();
const mint = new PublicKey(dep.mint);
const quoteMint = new PublicKey(dep.quoteMint);

const { connection, program, wallet } = makeProgram();
const state = new PublicKey(dep.state);
const pool = canonicalPool(mint, quoteMint);

const info = await connection.getAccountInfo(pool, "confirmed");
if (!info) {
  throw new Error(
    `Canonical PumpSwap pool not found: ${pool.toBase58()}\n` +
    "The token may not have graduated to PumpSwap yet."
  );
}

const parsed = readPoolPrefix(info.data);
if (!parsed.baseMint.equals(mint) || !parsed.quoteMint.equals(quoteMint)) {
  throw new Error("Canonical pool mint mismatch.");
}

console.log("Canonical PumpSwap pool:", pool.toBase58());
console.log("Base vault:", parsed.baseVault.toBase58());
console.log("Quote vault:", parsed.quoteVault.toBase58());

const sig = await program.methods
  .bindCanonicalPool()
  .accounts({
    caller: wallet.publicKey,
    mint,
    quoteMint,
    state,
    pool,
    poolBaseTokenAccount: parsed.baseVault,
    poolQuoteTokenAccount: parsed.quoteVault
  })
  .rpc();

dep.pool = pool.toBase58();
dep.poolBaseTokenAccount = parsed.baseVault.toBase58();
dep.poolQuoteTokenAccount = parsed.quoteVault.toBase58();
dep.bindPoolTx = sig;
saveDeployment(dep, clusterName());

console.log("Bound:", sig);
