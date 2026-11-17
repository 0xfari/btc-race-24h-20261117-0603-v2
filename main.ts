// Snapback Longhold — a bot that trades Coinbase Wrapped BTC (cbBTC) on
// 1-minute on-chain prices with $1,000 of paper money, for make.fun's
// "Race a BTC trading bot live for 24 hours" (btc-race-24h-20261117-0603).
//
// Idea, in one sentence: sharp half-hour drops in BTC snap back over hours,
// so buy the drop once the minute turns up, ride the recovery for up to
// seven hours, and let a trailing stop keep the profit.
//
// This is the second entry for this race. The first ("Snapback", same entry
// shape with a 2-hour hold) makes +$9.87 on the dev window. Letting the
// bounce run longer makes +$14.65 on the same window — the recovery after
// the dev window's dip keeps climbing for ~400 bars (low $64,069 at bar 573,
// high $65,467 at bar 967) — and the same parameters make +$21.72 on the
// previous race's volatile dev window, so the longer ride is not tuned to
// one calm day: on the volatile window the trailing stop fires first and
// the hold never binds.
//
// Why this shape, from the dev window (2026-11-16 06:03 -> 2026-11-17 06:03
// UTC, 1,440 one-minute bars, net +0.49%, high $65,610, low $63,874):
//   - The window is calm: 60-minute returns have a 0.52% stdev and the
//     deepest 60-minute drop is only -2.06%. The previous race's winner
//     (an hourly-drop buyer at 1.8%) catches one trade here and LOSES
//     -$2.22 — the hourly-drop edge is too slow for this window.
//   - The edge that survives here is at 30 minutes: after a 30-minute drop
//     of 0.8% or more, the next 30 minutes average +0.22% (median +0.34%,
//     positive 83% of the time). After a 60-minute drop the bounce is
//     smaller (+0.19% mean) and after a 120-minute drop smaller still.
//   - So the entry is a sharp 30-minute drop, the exit is time (7h) plus a
//     trailing stop that only arms once the trade is up 0.5%. No fixed
//     take-profit and no fixed stop-loss: both were tested against both dev
//     windows and both cut the winners that pay (a 1.8% take-profit lifts
//     this window to +$17.12 but caps the volatile window's big V and drops
//     it to +$10.31).
//   - Hold sweep (local backtest, exact-integer replica of the harness
//     fill math: 4 bps fee, 2 bps slippage, constant-product impact vs
//     the bar's open depth, fills at the next bar's open): hold 300/360/
//     390/420/450 bars gives +$12.01/+$13.32/+$14.77/+$14.65/+$14.79 on
//     this window and +$21.72 on the volatile window throughout — a flat
//     region, not a point. 420 bars is its middle. Hold 120 (Snapback)
//     gives +$9.87 here; hold 480+ gives less again (+$12.58 at 480).
//   - Shallower drops (60-min 1.0%, three trades, +$17.12 here) were
//     rejected: they lose -$14.82 on the volatile window. Scale-in and
//     trend-following second signals were tested too and lose on at least
//     one window. The trailing stop at 0.7% is a genuine sensitivity:
//     0.6% fires on a noise pullback and drops this window to +$4.89,
//     while 0.7-0.8% holds; 0.7% is kept because it is also the best value
//     on the volatile window (+$21.72 vs +$17.07 at 0.8%).
//   - Local backtest: +$14.65 on this dev window (1 trade, max drawdown
//     0.62%), +$21.72 on the previous race's dev window (3 trades), and
//     still +$13.84 / +$19.29 at double fees. See EVIDENCE.md.
//
// All decisions are exact integer math on raw price units; no clock, no
// randomness, no network, no files outside the repository — the bot is
// fully deterministic: two runs on the same bars emit the same orders.

import { BPS, runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

/** Bars of history a drop is measured over (half an hour of 1-min bars). */
const LOOKBACK_BARS = 30;
/** How far the close must have fallen over the lookback to count as a drop. */
const DROP_BPS = 150n;
/** Bars to stay in a trade at most (seven hours). The bounce after a sharp
 *  dip keeps recovering for ~400 bars on the dev window; holds of 390-450
 *  bars all grade within $0.14 of each other, and 420 is the middle of
 *  that flat region. On the volatile window the trailing stop fires first
 *  and the hold never binds. */
const HOLD_BARS = 420;
/** Trailing stop: sell when the position's value falls this far below its peak. */
const TRAIL_BPS = 70n;
/** Arm for the trailing stop: it only starts watching once the peak value
 *  is this far above what the position cost. */
const TRAIL_ARM_BPS = 50n;
/** Slippage allowance on every order, wide open: the fill math (fee +
 *  slippage + own impact) is small next to the moves this bot trades, and
 *  a rejected order is a missed bounce. The harness still caps fills by
 *  the pool's own depth, so a wild open cannot fill far away. */
const MAX_SLIPPAGE_BPS = 10_000;

/** Closes seen so far, oldest first, one per batch. */
const closes: bigint[] = [];
let lastBatchT = -1;

/** State of the open trade, set when a filled position is first observed. */
let entrySeq = -1;
let peakValue = 0n;

await runBars({
  onBatch(state) {
    // While warming up every order would be rejected and never retried.
    if (state.warmingUp) return [];

    const now = state.close(SYMBOL);
    if (now === null) return [];
    if (state.t !== lastBatchT) {
      closes.push(now);
      lastBatchT = state.t;
    }

    const held = state.positions.get(SYMBOL);
    const heldQty = held?.qty ?? 0n;

    // -- Holding: decide whether to sell. ---------------------------------
    if (heldQty > 0n && held !== undefined) {
      const cost = held.cost;
      const value = state.value(SYMBOL, heldQty, now);
      if (entrySeq < 0) {
        // First sight of this position: the fill just landed.
        entrySeq = state.seq;
        peakValue = value;
      }
      if (value > peakValue) peakValue = value;
      const armed = peakValue * BPS >= cost * (BPS + TRAIL_ARM_BPS);
      const trailed = armed && value * BPS <= peakValue * (BPS - TRAIL_BPS);
      const expired = state.seq - entrySeq >= HOLD_BARS;
      if (trailed || expired) {
        entrySeq = -1;
        peakValue = 0n;
        const sell: SellInput = {
          side: 'sell',
          symbol: SYMBOL,
          qty: heldQty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        };
        return [sell];
      }
      return [];
    }

    // -- Flat: decide whether to buy. --------------------------------------
    entrySeq = -1;
    peakValue = 0n;
    if (closes.length <= LOOKBACK_BARS) return [];
    const then = closes[closes.length - 1 - LOOKBACK_BARS]!;
    const prev = closes[closes.length - 2]!;
    // A sharp 30-minute drop...
    const dropped = now * BPS <= then * (BPS - DROP_BPS);
    // ...and the latest minute turned up off the low (the bounce has begun).
    const turningUp = now >= prev;
    if (!dropped || !turningUp) return [];

    const room = state.weightRoom(SYMBOL);
    const notional = state.cash < room ? state.cash : room;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    const buy: BuyInput = {
      side: 'buy',
      symbol: SYMBOL,
      notional_quote_units: notional,
      max_slippage_bps: MAX_SLIPPAGE_BPS,
    };
    return [buy];
  },
});
