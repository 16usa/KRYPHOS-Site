import { collectCreatorFees } from "./lib.mjs";

const execute = process.argv.includes("--execute");
try {
  const result = await collectCreatorFees({ execute });
  console.log(JSON.stringify(result, null, 2));
  if (!execute) console.log("\nDRY RUN ONLY. Add --execute to actually collect creator fees.");
} catch (err) {
  console.error(err?.message || err);
  process.exitCode = 1;
}
