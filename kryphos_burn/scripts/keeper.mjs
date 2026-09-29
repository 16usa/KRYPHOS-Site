import { executeOne } from "./execute-burn.mjs";

const intervalMs = Math.max(15_000, Number(process.env.KEEPER_INTERVAL_MS || 30_000));

console.log("KRYPHOS permissionless burn keeper");
console.log(`Check interval: ${Math.round(intervalMs / 1000)}s`);
console.log("The keeper has no authority over the vault; it only pays transaction fees.");
console.log("");

async function tick() {
  try {
    const sig = await executeOne({ quiet: true });
    console.log(new Date().toISOString(), "burn executed", sig);
  } catch (err) {
    const msg = String(err?.message || err);
    // Expected while a milestone has not been reached.
    if (
      msg.includes("MilestoneNotReached") ||
      msg.includes("milestone") ||
      msg.includes("AllStagesComplete")
    ) {
      console.log(new Date().toISOString(), msg.split("\n")[0]);
      return;
    }
    console.error(new Date().toISOString(), msg);
  }
}

await tick();
setInterval(tick, intervalMs);
