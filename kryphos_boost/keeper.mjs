import { boolEnv, collectCreatorFees } from "./lib.mjs";
import { evaluateBoostPlan } from "./engine.mjs";
import { executeReserveTopUp } from "./sell-reserve.mjs";

const intervalMs = Math.max(30000, Number(process.env.BOOST_ENGINE_INTERVAL_MS || 60000));
let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    if (boolEnv("AUTO_COLLECT_CREATOR_FEES", false) && process.env.CREATOR_KEYPAIR) {
      try {
        const result = await collectCreatorFees({ execute: true });
        if (result.collected) console.log(new Date().toISOString(), "creator fees collected", result.signature);
      } catch (err) {
        console.error(new Date().toISOString(), "fee collection:", err?.message || err);
      }
    }

    let state = await evaluateBoostPlan({ publish: true });
    console.log(
      new Date().toISOString(),
      state.plan?.action,
      "boost", state.plan?.packBoosts || "-",
      "fees-first", `$${Number(state.funding?.feesFirstUsd || 0).toFixed(2)}`,
      "reserve-topup", `$${Number(state.plan?.reserveTopUpUsd || 0).toFixed(2)}`
    );

    if (boolEnv("AUTO_RESERVE_TOPUP", false) && state.plan?.action === "RESERVE_TOPUP_READY") {
      const result = await executeReserveTopUp({ execute: true });
      console.log(new Date().toISOString(), "reserve top-up executed", result.sellSignature);
      state = await evaluateBoostPlan({ publish: true });
    }
  } finally {
    busy = false;
  }
}
await tick();
setInterval(tick, intervalMs);
