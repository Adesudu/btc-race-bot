[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Adesudu/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Adesudu/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

# Dip-Recovery BTC Bot

Trades Coinbase Wrapped BTC (cbBTC) against USDC, one minute at a time, in
the [make.fun `btc-race-24h-20261117-0603` competition](https://make.fun/bounty/btc-race-24h-20261117-0603). Starts with 1,000
USDC of paper money, long only, at most one open position.

## Strategy

A full round trip costs roughly 26-37 bps in fees, slippage and pool
impact, while most 1-minute BTC moves are noise, so the bot trades rarely
and only for the big swings:

- **Entry — buy the dip's recovery.** Wait until the close falls at least
  120 bps below the running high, then buy the moment it recovers at
  least 20 bps from the low of that pullback.
- **Exit — wide stops.** A trailing stop 250 bps below the highest close
  since entry, and a hard stop 300 bps below the entry close. After a
  sell, a 120-bar cooldown keeps the bot out of the same chop.
- **Fallback.** If no dip ever comes, buy at the 720th tradable bar so
  the bot is in the market for the second half of the window.
- **Size.** Every buy spends all available cash; every sell closes the
  whole position. Max slippage 200 bps.

All state is a pure function of the bars (bigint arithmetic, no clock, no
randomness), so two runs produce identical action logs.

## Files

- `main.ts` — the bot (entrypoint, run with `node /bot/main.ts`)
- `vendor/makefun-bars.ts` — the kit's protocol shim, copied byte-for-byte
- `README.md`, `LICENSE` (MIT)
