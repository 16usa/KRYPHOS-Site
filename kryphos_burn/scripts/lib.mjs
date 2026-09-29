import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_AMM_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export const SOL_USD_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
export const USDC_USD_FEED_ID = "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";

export function expandHome(p) {
  if (!p) return p;
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

export function loadKeypair(file = process.env.SOLANA_WALLET || "~/.config/solana/id.json") {
  const bytes = JSON.parse(fs.readFileSync(expandHome(file), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export function rpcUrl() {
  return process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
}

export function clusterName() {
  return process.env.KRYPHOS_CLUSTER || "devnet";
}

export function loadIdl() {
  const file = path.resolve("target/idl/kryphos_burn.json");
  if (!fs.existsSync(file)) {
    throw new Error("Missing target/idl/kryphos_burn.json. Run anchor build first.");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function makeProgram(walletFile) {
  const keypair = loadKeypair(walletFile);
  const connection = new Connection(rpcUrl(), "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed"
  });
  anchor.setProvider(provider);
  const idl = loadIdl();
  const program = new anchor.Program(idl, provider);
  return { connection, wallet, provider, program, keypair };
}

export function pdaState(programId, mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("state"), mint.toBuffer()],
    programId
  )[0];
}

export function pdaVaultAuthority(programId, state) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault-authority"), state.toBuffer()],
    programId
  )[0];
}

export function pdaVault(programId, state) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), state.toBuffer()],
    programId
  )[0];
}

export function canonicalPool(mint, quoteMint) {
  const creator = PublicKey.findProgramAddressSync(
    [Buffer.from("pool-authority"), mint.toBuffer()],
    PUMP_PROGRAM
  )[0];

  const index = Buffer.alloc(2);
  index.writeUInt16LE(0);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      index,
      creator.toBuffer(),
      mint.toBuffer(),
      quoteMint.toBuffer()
    ],
    PUMP_AMM_PROGRAM
  )[0];
}

export function readPoolPrefix(data) {
  if (!Buffer.isBuffer(data)) data = Buffer.from(data);
  if (data.length < 203) throw new Error(`PumpSwap pool too short: ${data.length}`);

  return {
    index: data.readUInt16LE(9),
    creator: new PublicKey(data.subarray(11, 43)),
    baseMint: new PublicKey(data.subarray(43, 75)),
    quoteMint: new PublicKey(data.subarray(75, 107)),
    baseVault: new PublicKey(data.subarray(139, 171)),
    quoteVault: new PublicKey(data.subarray(171, 203))
  };
}

export function deploymentFile(cluster = clusterName()) {
  return path.resolve("deployments", `${cluster}.json`);
}

export function saveDeployment(data, cluster = clusterName()) {
  const file = deploymentFile(cluster);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return file;
}

export function loadDeployment(cluster = clusterName()) {
  const file = deploymentFile(cluster);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function short(k) {
  const s = k?.toString?.() || String(k || "");
  return s.length > 16 ? `${s.slice(0, 7)}…${s.slice(-7)}` : s;
}


export async function tokenProgramForMint(connection, mint) {
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info) throw new Error(`Mint account not found: ${mint.toBase58()}`);
  return info.owner;
}
