import BN from "bn.js";
import {
  env, boolEnv, connection, loadKeypair, pubkey, mintDecimals,
  OnlinePumpSdk, Transaction, sendAndConfirmTransaction,
  LAMPORTS_PER_SOL, transferSol,
} from "./lib.mjs";
import { evaluateBoostPlan } from "./engine.mjs";

export async function executeReserveTopUp({ execute = false } = {}) {
  const state = await evaluateBoostPlan({ publish: true });
  if (state.plan?.action !== "RESERVE_TOPUP_READY") {
    throw new Error(`Reserve top-up is not ready: ${state.plan?.action || state.status}`);
  }

  const impact = Number(state.plan.estimatedPriceImpactPct);
  const limit = Number(state.guard.maxPriceImpactPct);
  if (!(impact <= limit)) throw new Error(`Guard blocked: estimated impact ${impact}% > ${limit}%`);

  const reserve = loadKeypair(env("BOOST_RESERVE_KEYPAIR"));
  const expectedReserve = pubkey(env("BOOST_RESERVE_WALLET"), "BOOST_RESERVE_WALLET");
  if (!reserve.publicKey.equals(expectedReserve)) {
    throw new Error("BOOST_RESERVE_KEYPAIR does not match BOOST_RESERVE_WALLET");
  }

  const mint = pubkey(env("MINT_ADDRESS"), "MINT_ADDRESS");
  const treasury = pubkey(env("BOOST_TREASURY_WALLET"), "BOOST_TREASURY_WALLET");
  const conn = connection();
  const decimals = await mintDecimals(conn, mint);
  const raw = BigInt(Math.ceil(Number(state.plan.reserveTokensToSell) * (10 ** decimals)));
  if (raw <= 0n) throw new Error("Calculated reserve sale is zero");

  const sdk = new OnlinePumpSdk(conn);
  const ixs = await sdk.routedSellInstructions({
    mint,
    user: reserve.publicKey,
    baseAmountIn: new BN(raw.toString()),
    slippage: Number(env("RESERVE_SELL_SLIPPAGE_PCT", "1"))
  });

  const dry = {
    execute,
    packBoosts: state.plan.packBoosts,
    packCostUsd: state.plan.packCostUsd,
    reserveTopUpUsd: state.plan.reserveTopUpUsd,
    reserveTokensToSell: state.plan.reserveTokensToSell,
    estimatedPriceImpactPct: impact,
    instructions: ixs.length,
    reserveWallet: reserve.publicKey.toBase58(),
    treasuryWallet: treasury.toBase58()
  };
  if (!execute) return { ...dry, dryRun: true };

  if (!boolEnv("ALLOW_RESERVE_SELL", false)) {
    throw new Error("Execution blocked. Set ALLOW_RESERVE_SELL=YES only when you intentionally enable live reserve sales.");
  }

  const before = await conn.getBalance(reserve.publicKey, "confirmed");
  const tx = new Transaction().add(...ixs);
  const sellSig = await sendAndConfirmTransaction(conn, tx, [reserve], { commitment: "confirmed" });
  const after = await conn.getBalance(reserve.publicKey, "confirmed");

  const gained = Math.max(0, after - before);
  const desired = Math.floor(Number(state.plan.reserveTopUpUsd) / Number(state.market.solUsd) * LAMPORTS_PER_SOL);
  const feeCushion = Math.floor(0.003 * LAMPORTS_PER_SOL);
  const transferable = Math.max(0, Math.min(gained, desired, after - feeCushion));

  let transferSig = null;
  if (transferable > 0 && !reserve.publicKey.equals(treasury)) {
    transferSig = await transferSol({ from: reserve, to: treasury, lamports: transferable });
  }
  return {
    ...dry,
    dryRun: false,
    sellSignature: sellSig,
    treasuryTransferSignature: transferSig,
    realizedSolApprox: gained / LAMPORTS_PER_SOL,
    transferredSol: transferable / LAMPORTS_PER_SOL
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  executeReserveTopUp({ execute: process.argv.includes("--execute") })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (result.dryRun) console.log("\nDRY RUN ONLY. No token was sold.");
    })
    .catch(err => {
      console.error(err?.message || err);
      process.exitCode = 1;
    });
}
