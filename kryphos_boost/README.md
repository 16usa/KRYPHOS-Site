# KRYPHOS Adaptive Boost Engine

This replaces the old 700M staged-burn mechanism.

- Total supply: **1,000,000,000 KRYPHOS**
- Dedicated Boost Reserve: **100,000,000 KRYPHOS (10%)**
- No fixed time horizon
- Boost choices: **10 / 30 / 50 / 100 / 500**
- Fees / existing Boost Treasury funds are counted first
- Reserve covers only the shortfall
- Reserve sale is blocked when estimated impact exceeds the configured guard

The engine reads DEX Screener live pair/Boost state, Pump creator fees, Treasury SOL and reserve balance. It chooses the highest safe affordable Boost and publishes the state to the Verification page.

DEX Screener currently documents Boost purchase through its browser checkout and exposes read APIs for Boost/order verification. This build therefore does not fake an undocumented write API. It prepares/funds the Treasury and verifies the paid Boost publicly.

Dry status:
    node kryphos_boost/status.mjs

Dry reserve top-up:
    node kryphos_boost/sell-reserve.mjs

Live reserve top-up requires an explicit gate:
    ALLOW_RESERVE_SELL=YES node kryphos_boost/sell-reserve.mjs --execute

Do not enable live actions until mint, wallets, current Boost pricing, liquidity and dry-run output have been verified.

No price appreciation or trending outcome is guaranteed by this mechanism.
