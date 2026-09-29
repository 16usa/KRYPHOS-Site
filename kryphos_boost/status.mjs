import { evaluateBoostPlan } from "./engine.mjs";

try {
  const s = await evaluateBoostPlan({ publish: true });
  console.log("KRYPHOS Adaptive Boost Engine");
  console.log("=============================");
  console.log("Configured:     ", s.configured ? "YES" : "NO");
  console.log("Status:         ", s.status);
  console.log("Mint:           ", s.addresses.mint || "Not configured");
  console.log("Reserve wallet: ", s.addresses.reserveWallet || "Not configured");
  console.log("Boost treasury: ", s.addresses.boostTreasuryWallet || "Not configured");
  console.log("Reserve balance:", Number(s.funding.reserveTokenBalance || 0).toLocaleString(), "KRYPHOS");
  console.log("Fees first:     $", Number(s.funding.feesFirstUsd || 0).toFixed(2));
  console.log("Active Boosts:  ", s.market.activeBoosts ?? 0);
  console.log("Next pack:      ", s.plan.packBoosts ?? "—");
  console.log("Reserve top-up: $", Number(s.plan.reserveTopUpUsd || 0).toFixed(2));
  console.log("Est. impact:    ", s.plan.estimatedPriceImpactPct == null ? "—" : `${Number(s.plan.estimatedPriceImpactPct).toFixed(3)}%`);
  console.log("Reason:         ", s.plan.reason || "—");
} catch (err) {
  console.error("STATUS ERROR:", err?.message || err);
  process.exitCode = 1;
}
