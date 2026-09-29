import { PublicKey } from "@solana/web3.js";
import {
  makeProgram,
  loadDeployment,
  short
} from "./lib.mjs";

const dep = loadDeployment();
const { connection, program } = makeProgram();
const stateKey = new PublicKey(dep.state);
const vaultKey = new PublicKey(dep.vault);

const state = await program.account.burnState.fetch(stateKey);
const mintSupply = await connection.getTokenSupply(new PublicKey(dep.mint), "confirmed");
const vaultBalance = await connection.getTokenAccountBalance(vaultKey, "confirmed");

console.log("KRYPHOS ON-CHAIN STATUS");
console.log("-----------------------");
console.log("Program:", program.programId.toBase58());
console.log("Mint:", dep.mint);
console.log("State:", dep.state);
console.log("Vault:", dep.vault);
console.log("Pool:", state.poolBound ? state.pool.toBase58() : "NOT BOUND");
console.log("Stage:", `${Number(state.stage)}/10`);
console.log("Supply:", mintSupply.value.uiAmountString);
console.log("Vault balance:", vaultBalance.value.uiAmountString);
console.log("Pool bound:", Boolean(state.poolBound));
