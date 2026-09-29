import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";

export const TOTAL_SUPPLY = 1_000_000_000;
export const BOOST_RESERVE_TOKENS = 100_000_000;
export const DEFAULT_MAX_PRICE_IMPACT_PCT = 0.5;
export const WSOL = "So11111111111111111111111111111111111111112";

export function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}
export function boolEnv(name, fallback = false) {
  const v = String(env(name, fallback ? "1" : "0")).toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}
export function expandHome(p) {
  if (!p) return p;
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}
export function loadKeypair(file) {
  const target = expandHome(file);
  if (!target || !fs.existsSync(target)) throw new Error(`Missing keypair: ${target || "(empty path)"}`);
  const bytes = JSON.parse(fs.readFileSync(target, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}
export function connection() {
  return new Connection(env("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"), "confirmed");
}
export function pubkey(value, label) {
  try { return new PublicKey(value); }
  catch { throw new Error(`${label} is missing or invalid`); }
}
export function readPackPrices() {
  const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), "boost-pack-prices.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}
export async function fetchDexPairs(mint) {
  const data = await fetchJson(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter(x => x?.baseToken?.address === mint)
    .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
}
export async function fetchSolUsd() {
  const pairs = await fetchDexPairs(WSOL);
  const good = pairs.find(p => {
    const q = String(p?.quoteToken?.symbol || "").toUpperCase();
    return ["USDC", "USDT", "USD"].includes(q) && Number(p?.priceUsd) > 0;
  }) || pairs.find(p => Number(p?.priceUsd) > 0);
  const value = Number(good?.priceUsd || 0);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Unable to resolve SOL/USD");
  return value;
}
export async function fetchDexOrders(mint) {
  try {
    const data = await fetchJson(`https://api.dexscreener.com/orders/v1/solana/${mint}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
export async function tokenBalanceUi(conn, owner, mint) {
  const result = await conn.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed");
  let total = 0;
  for (const row of result.value) {
    total += Number(row?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString || 0);
  }
  return total;
}
export async function mintDecimals(conn, mint) {
  const info = await conn.getParsedAccountInfo(mint, "confirmed");
  const d = Number(info?.value?.data?.parsed?.info?.decimals);
  if (!Number.isInteger(d) || d < 0 || d > 9) throw new Error("Unable to resolve mint decimals");
  return d;
}
export function estimateSellImpactPct(baseReserveTokens, sellTokens) {
  const x = Number(baseReserveTokens);
  const dx = Number(sellTokens);
  if (!(x > 0) || !(dx >= 0)) return null;
  if (dx === 0) return 0;
  return (1 - (x / (x + dx)) ** 2) * 100;
}
export function maxTokensForImpact(baseReserveTokens, maxImpactPct) {
  const x = Number(baseReserveTokens);
  const p = Number(maxImpactPct) / 100;
  if (!(x > 0) || !(p > 0) || p >= 1) return 0;
  return x * (1 / Math.sqrt(1 - p) - 1);
}
export function atomicWriteJson(file, value) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, target);
}
export async function unclaimedCreatorFeesSol(conn, creator) {
  if (!creator) return 0;
  try {
    const sdk = new OnlinePumpSdk(conn);
    const amount = await sdk.getCreatorVaultBalanceBothPrograms(creator);
    return Number(amount.toString()) / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}
export async function collectCreatorFees({ execute = false } = {}) {
  const conn = connection();
  const file = env("CREATOR_KEYPAIR");
  if (!file) throw new Error("CREATOR_KEYPAIR is required to collect fees");
  const kp = loadKeypair(file);
  const sdk = new OnlinePumpSdk(conn);
  const balance = await sdk.getCreatorVaultBalanceBothPrograms(kp.publicKey);
  const lamports = Number(balance.toString());
  if (lamports <= 0) return { collected: false, availableSol: 0, signature: null };
  const ixs = await sdk.collectCoinCreatorFeeInstructions(kp.publicKey);
  if (!execute) {
    return { collected: false, dryRun: true, availableSol: lamports / LAMPORTS_PER_SOL, instructions: ixs.length };
  }
  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(conn, tx, [kp], { commitment: "confirmed" });
  return { collected: true, availableSol: lamports / LAMPORTS_PER_SOL, signature: sig };
}
export async function transferSol({ from, to, lamports }) {
  const conn = connection();
  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: from.publicKey,
    toPubkey: to,
    lamports
  }));
  return sendAndConfirmTransaction(conn, tx, [from], { commitment: "confirmed" });
}
export { BN, PublicKey, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL, OnlinePumpSdk };
