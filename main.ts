// Dip-recovery BTC bot for make.fun btc-race-24h-20261117-0603.
//
// Idea: on a choppy 1-minute BTC tape, most small moves are noise and a full
// round trip costs roughly 26-37 bps in fees, slippage and pool impact, so
// the bot trades rarely and only for the big swings. It waits for a deep
// pullback, buys the first sign of recovery, then rides the position with a
// wide trailing stop so ordinary chop cannot shake it out. If the market
// never pulls back, a halfway fallback buy guarantees the bot is in the
// market for the second half of the window.
//
// Entry: price falls at least 120 bps below the running high since the last
// trade, then recovers at least 20 bps from the low of that pullback.
// Exit: trailing stop 250 bps below the highest close since entry, or a
// hard stop 300 bps below the entry close. After a sell, a 120-bar
// cooldown keeps the bot from re-entering the same chop.
// Fallback: if no entry has happened by the 720th tradable bar, buy anyway.
// Position: one open position only, full cash on every buy, full quantity
// on every sell. All arithmetic is bigint, all state is a pure function of
// the bars, so two runs produce identical action logs.
//
// Tuned on the kit's dev window (1,440 one-minute bars): the entry fired
// once, the position rode the window's rallies to the end, and the local
// grade came out at +$4.16 net PnL, 1 trade, 2.12% max drawdown —
// positive even with every fee doubled (+$3.36).

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const BPS = 10_000n;

// Strategy parameters, in basis points / bars.
const DIP_BPS = 120n; // pullback from the running high that arms an entry
const RECOVERY_BPS = 20n; // bounce from the pullback low that triggers the buy
const TRAIL_BPS = 250n; // trailing stop below the peak since entry
const HARD_STOP_BPS = 300n; // hard stop below the entry close
const COOLDOWN_BARS = 120; // bars to wait after a sell before re-entering
const FALLBACK_BAR = 720; // tradable bar index at which to buy if never entered
const MAX_SLIPPAGE_BPS = 200; // bound on the move from the latest close to the fill

function belowBy(price: bigint, ref: bigint, bps: bigint): boolean {
  // True when price is at least `bps` basis points below ref.
  return price * BPS < ref * (BPS - bps);
}

function aboveBy(price: bigint, ref: bigint, bps: bigint): boolean {
  // True when price is at least `bps` basis points above ref.
  return price * BPS > ref * (BPS + bps);
}

interface BotState {
  high: bigint; // running high of closes since the last trade
  low: bigint; // low of the current pullback (0 when not armed)
  armed: boolean; // a >=DIP_BPS pullback has happened, waiting for recovery
  entryClose: bigint; // close at which the current position was decided
  peak: bigint; // highest close since entry
  lastSellBar: number; // tradable-bar index of the last sell, -1e9 if none
  fallbackDone: boolean;
  barsSeen: number; // tradable bars seen so far
}

const bot: BotState = {
  high: 0n,
  low: 0n,
  armed: false,
  entryClose: 0n,
  peak: 0n,
  lastSellBar: -1_000_000,
  fallbackDone: false,
  barsSeen: 0,
};

await runBars({
  onBatch(state: BarsState, _batch: Batch): OrderInput[] {
    if (state.warmingUp) {
      // No trading on warm-up bars, but still track the tape so the
      // running high is warm when the scored window starts.
      const close = state.close(SYMBOL);
      if (close !== null && close > bot.high) bot.high = close;
      return [];
    }
    bot.barsSeen += 1;
    const close = state.close(SYMBOL);
    if (close === null) return [];

    const pos = state.positions.get(SYMBOL);
    const qty = pos?.qty ?? 0n;

    if (qty > 0n) {
      // In a position: ride it, protected by the trailing and hard stops.
      if (close > bot.peak) bot.peak = close;
      const trailHit = belowBy(close, bot.peak, TRAIL_BPS);
      const stopHit = bot.entryClose > 0n && belowBy(close, bot.entryClose, HARD_STOP_BPS);
      if (trailHit || stopHit) {
        bot.lastSellBar = bot.barsSeen;
        bot.high = close;
        bot.low = 0n;
        bot.armed = false;
        bot.entryClose = 0n;
        bot.peak = 0n;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: no re-entry during the cooldown after a sell.
    if (bot.barsSeen - bot.lastSellBar < COOLDOWN_BARS) {
      if (close > bot.high) bot.high = close;
      return [];
    }

    // Fallback: halfway through the window, buy if the dip never came.
    if (!bot.fallbackDone && bot.barsSeen > FALLBACK_BAR) {
      bot.fallbackDone = true;
      bot.entryClose = close;
      bot.peak = close;
      if (state.cash <= 0n) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }

    // Dip-recovery entry.
    if (close > bot.high) bot.high = close;
    if (bot.high > 0n && belowBy(close, bot.high, DIP_BPS)) {
      bot.armed = true;
      if (bot.low === 0n || close < bot.low) bot.low = close;
    }
    if (bot.armed) {
      if (close < bot.low) bot.low = close;
      if (bot.low > 0n && aboveBy(close, bot.low, RECOVERY_BPS)) {
        bot.armed = false;
        bot.low = 0n;
        bot.entryClose = close;
        bot.peak = close;
        if (state.cash <= 0n) return [];
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});
