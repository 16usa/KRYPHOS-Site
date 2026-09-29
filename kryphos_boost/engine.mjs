import path from "node:path";
import {
  BOOST_RESERVE_TOKENS,
  DEFAULT_MAX_PRICE_IMPACT_PCT,
  env, pubkey, connection, readPackPrices, fetchDexPairs, fetchDexOrders,
  fetchSolUsd, tokenBalanceUi, estimateSellImpactPct, maxTokensForImpact,
  atomicWriteJson, unclaimedCreatorFeesSol, LAMPORTS_PER_SOL,
} from "./lib.mjs";

const SITE_STATE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../kryphos_site/boost-state.json");

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function choosePair(pairs, mint) {
  return pairs.find(p => p?.baseToken?.address === mint) || pairs[0] || null;
}
function packArray(pricing) {
  return [...(pricing?.packs || [])]
    .filter(p => num(p.boosts) > 0 && num(p.usd) > 0)
    .sort((a, b) => num(b.boosts) - num(a.boosts));
}

export async function evaluateBoostPlan({ publish = true } = {}) {
  const mintText = env("MINT_ADDRESS");
  const reserveText = env("BOOST_RESERVE_WALLET");
  const treasuryText = env("BOOST_TREASURY_WALLET");
  const creatorText = env("CREATOR_WALLET", treasuryText);
  const maxImpactPct = num(env("MAX_PRICE_IMPACT_PCT", DEFAULT_MAX_PRICE_IMPACT_PCT), DEFAULT_MAX_PRICE_IMPACT_PCT);
  const priceBufferPct = num(env("BOOST_PRICE_BUFFER_PCT", "5"), 5);

  const pricing = readPackPrices();
  const packs = packArray(pricing);
  const state = {
    version: 1,
    generatedAt: new Date().toISOString(),
    configured: false,
    status: "WAITING_CONFIGURATION",
    addresses: {
      mint: mintText || "",
      reserveWallet: reserveText || "",
      boostTreasuryWallet: treasuryText || "",
      creatorWallet: creatorText || ""
    },
    funding: {
      reserveTokenBalance: BOOST_RESERVE_TOKENS,
      reservePercentRemaining: 100,
      treasurySol: 0,
      unclaimedCreatorFeesSol: 0,
      feesFirstUsd: 0
    },
    market: {
      priceUsd: null,
      solUsd: null,
      liquidityUsd: null,
      liquidityBase: null,
      marketCap: null,
      activeBoosts: 0,
      pairDex: null,
      pairAddress: null
    },
    guard: { maxPriceImpactPct: maxImpactPct, priceBufferPct },
    pricing: { asOf: pricing.asOf || null, source: pricing.source || "operator-confirmed checkout", packs },
    plan: {
      action: "WAITING_CONFIGURATION",
      packBoosts: null,
      packCostUsd: null,
      reserveTopUpUsd: 0,
      reserveTokensToSell: 0,
      estimatedPriceImpactPct: null,
      safeReserveTokensNow: 0,
      reason: "Configure mint, reserve wallet and Boost Treasury"
    },
    verification: { dexOrdersSeen: 0, latestOrder: null }
  };

  if (!mintText || !reserveText || !treasuryText) {
    if (publish) atomicWriteJson(SITE_STATE, state);
    return state;
  }

  const conn = connection();
  const mint = pubkey(mintText, "MINT_ADDRESS");
  const reserve = pubkey(reserveText, "BOOST_RESERVE_WALLET");
  const treasury = pubkey(treasuryText, "BOOST_TREASURY_WALLET");
  const creator = creatorText ? pubkey(creatorText, "CREATOR_WALLET") : treasury;

  const [pairs, solUsd, reserveBalance, treasuryLamports, creatorFeesSol, orders] = await Promise.all([
    fetchDexPairs(mintText),
    fetchSolUsd(),
    tokenBalanceUi(conn, reserve, mint),
    conn.getBalance(treasury, "confirmed"),
    unclaimedCreatorFeesSol(conn, creator),
    fetchDexOrders(mintText)
  ]);

  const pair = choosePair(pairs, mintText);
  const priceUsd = num(pair?.priceUsd);
  const liquidityBase = num(pair?.liquidity?.base);
  const liquidityUsd = num(pair?.liquidity?.usd);
  const marketCap = num(pair?.marketCap ?? pair?.fdv);
  const activeBoosts = num(pair?.boosts?.active);
  const treasurySol = treasuryLamports / LAMPORTS_PER_SOL;
  const feesFirstUsd = (treasurySol + creatorFeesSol) * solUsd;
  const safeTokensNow = Math.min(reserveBalance, maxTokensForImpact(liquidityBase, maxImpactPct));

  Object.assign(state.funding, {
    reserveTokenBalance: reserveBalance,
    reservePercentRemaining: BOOST_RESERVE_TOKENS > 0 ? reserveBalance / BOOST_RESERVE_TOKENS * 100 : 0,
    treasurySol,
    unclaimedCreatorFeesSol: creatorFeesSol,
    feesFirstUsd
  });
  Object.assign(state.market, {
    priceUsd: priceUsd || null,
    solUsd,
    liquidityUsd: liquidityUsd || null,
    liquidityBase: liquidityBase || null,
    marketCap: marketCap || null,
    activeBoosts,
    pairDex: pair?.dexId || null,
    pairAddress: pair?.pairAddress || null
  });
  state.verification.dexOrdersSeen = orders.length;
  state.verification.latestOrder = orders[0] || null;
  state.configured = true;

  if (!pair || !(priceUsd > 0) || !(liquidityBase > 0)) {
    state.status = "WAITING_PAIR";
    state.plan.action = "WAITING_PAIR";
    state.plan.reason = "No liquid DEX pair is available yet";
    if (publish) atomicWriteJson(SITE_STATE, state);
    return state;
  }

  if (activeBoosts > 0) {
    state.status = "ACTIVE_BOOST";
    state.plan.action = "WAIT_ACTIVE_BOOST";
    state.plan.reason = `${activeBoosts} Boosts are already active; avoid overlapping spend`;
    if (publish) atomicWriteJson(SITE_STATE, state);
    return state;
  }

  let selected = null;
  for (const pack of packs) {
    const costUsd = num(pack.usd) * (1 + priceBufferPct / 100);
    const shortfallUsd = Math.max(0, costUsd - feesFirstUsd);
    const tokensNeeded = shortfallUsd > 0 ? shortfallUsd / priceUsd : 0;
    const impactPct = estimateSellImpactPct(liquidityBase, tokensNeeded);
    const safe = tokensNeeded <= reserveBalance &&
      tokensNeeded <= safeTokensNow &&
      (impactPct == null || impactPct <= maxImpactPct + 1e-9);
    if (shortfallUsd === 0 || safe) {
      selected = { pack, costUsd, shortfallUsd, tokensNeeded, impactPct };
      break;
    }
  }

  if (!selected) {
    state.status = "ACCUMULATING";
    state.plan.action = "ACCUMULATE";
    state.plan.safeReserveTokensNow = safeTokensNow;
    state.plan.reason = "No Boost pack can be funded inside the current reserve price-impact guard";
  } else {
    state.status = selected.shortfallUsd > 0 ? "RESERVE_TOPUP_READY" : "BOOST_READY";
    state.plan = {
      action: state.status,
      packBoosts: num(selected.pack.boosts),
      packCostUsd: num(selected.pack.usd),
      packCostBufferedUsd: selected.costUsd,
      reserveTopUpUsd: selected.shortfallUsd,
      reserveTokensToSell: selected.tokensNeeded,
      estimatedPriceImpactPct: selected.impactPct,
      safeReserveTokensNow: safeTokensNow,
      reason: selected.shortfallUsd > 0
        ? "Fees/treasury are used first; reserve covers only the calculated shortfall"
        : "Fees/treasury can fund this Boost without selling reserve tokens"
    };
  }

  if (publish) atomicWriteJson(SITE_STATE, state);
  return state;
}

export function startEngine({ intervalMs = 60000 } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const state = await evaluateBoostPlan({ publish: true });
      console.log("[boost-engine]", state.status, state.plan?.packBoosts || "-", state.plan?.reason || "");
    } catch (err) {
      console.error("[boost-engine]", err?.message || err);
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, Math.max(30000, Number(intervalMs) || 60000));
  timer.unref?.();
  return timer;
}
