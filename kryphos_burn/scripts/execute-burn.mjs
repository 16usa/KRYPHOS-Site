import { PublicKey } from "@solana/web3.js";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import {
  makeProgram,
  loadDeployment,
  pdaVaultAuthority,
  readPoolPrefix,
  SOL_USD_FEED_ID,
  USDC_USD_FEED_ID,
  WSOL_MINT,
  USDC_MINT,
  tokenProgramForMint
} from "./lib.mjs";

export async function executeOne({ quiet = false } = {}) {
  const dep = loadDeployment();
  if (!dep.pool) throw new Error("Pool is not bound. Run bind-pool.mjs after graduation.");

  const mint = new PublicKey(dep.mint);
  const quoteMint = new PublicKey(dep.quoteMint);
  const state = new PublicKey(dep.state);
  const vault = new PublicKey(dep.vault);
  const pool = new PublicKey(dep.pool);

  const { connection, program, wallet } = makeProgram(process.env.KEEPER_KEYPAIR);
  const vaultAuthority = pdaVaultAuthority(program.programId, state);
  const tokenProgram = await tokenProgramForMint(connection, mint);

  const poolInfo = await connection.getAccountInfo(pool, "confirmed");
  if (!poolInfo) throw new Error("Bound PumpSwap pool account not found.");
  const parsed = readPoolPrefix(poolInfo.data);

  let feedId;
  if (quoteMint.equals(WSOL_MINT)) feedId = SOL_USD_FEED_ID;
  else if (quoteMint.equals(USDC_MINT)) feedId = USDC_USD_FEED_ID;
  else throw new Error("Unsupported quote mint.");

  const receiver = new PythSolanaReceiver({ connection, wallet });
  const priceUpdate = receiver.getPriceFeedAccountAddress(0, feedId);

  if (!quiet) {
    console.log("Caller:", wallet.publicKey.toBase58());
    console.log("Price feed account:", priceUpdate.toBase58());
  }

  const sig = await program.methods
    .burnNext()
    .accounts({
      caller: wallet.publicKey,
      mint,
      quoteMint,
      state,
      vaultAuthority,
      vaultTokenAccount: vault,
      pool,
      poolBaseTokenAccount: parsed.baseVault,
      poolQuoteTokenAccount: parsed.quoteVault,
      priceUpdate,
      tokenProgram
    })
    .rpc();

  if (!quiet) console.log("Burn tx:", sig);
  return sig;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  executeOne().catch(err => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
