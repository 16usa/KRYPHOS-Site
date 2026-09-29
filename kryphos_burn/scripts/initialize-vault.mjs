import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress
} from "@solana/spl-token";
import {
  makeProgram,
  pdaState,
  pdaVaultAuthority,
  pdaVault,
  saveDeployment,
  clusterName,
  tokenProgramForMint
} from "./lib.mjs";

const [mintArg, quoteArg] = process.argv.slice(2);
if (!mintArg || !quoteArg) {
  console.error("Usage: node scripts/initialize-vault.mjs <MINT> <QUOTE_MINT>");
  process.exit(1);
}

const mint = new PublicKey(mintArg);
const quoteMint = new PublicKey(quoteArg);
const { connection, program, wallet } = makeProgram();

const state = pdaState(program.programId, mint);
const vaultAuthority = pdaVaultAuthority(program.programId, state);
const vault = pdaVault(program.programId, state);
const tokenProgram = await tokenProgramForMint(connection, mint);
const source = await getAssociatedTokenAddress(
  mint,
  wallet.publicKey,
  false,
  tokenProgram
);

console.log("Program:", program.programId.toBase58());
console.log("Mint:", mint.toBase58());
console.log("Base token program:", tokenProgram.toBase58());
console.log("Source ATA:", source.toBase58());
console.log("State PDA:", state.toBase58());
console.log("Vault authority PDA:", vaultAuthority.toBase58());
console.log("Vault token PDA:", vault.toBase58());
console.log("");
console.log("This transaction moves exactly 700,000,000 tokens into the PDA burn vault.");

const sig = await program.methods
  .initializeVault()
  .accounts({
    payer: wallet.publicKey,
    mint,
    quoteMint,
    sourceTokenAccount: source,
    state,
    vaultAuthority,
    vaultTokenAccount: vault,
    tokenProgram
  })
  .rpc();

const cluster = clusterName();
const file = saveDeployment({
  cluster,
  programId: program.programId.toBase58(),
  mint: mint.toBase58(),
  quoteMint: quoteMint.toBase58(),
  state: state.toBase58(),
  vaultAuthority: vaultAuthority.toBase58(),
  vault: vault.toBase58(),
  pool: null,
  initializeTx: sig
}, cluster);

console.log("Initialized:", sig);
console.log("Saved:", file);
