# btc-race-24h-20261117-0603-v2

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/0xfari/btc-race-24h-20261117-0603-v2/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/0xfari/btc-race-24h-20261117-0603-v2/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

Snapback Longhold — a bot that trades Coinbase Wrapped BTC (cbBTC) on 1-minute
on-chain prices with $1,000 of paper money, for make.fun's "Race a BTC
trading bot live for 24 hours" competition. Second entry for this race: the
same sharp-dip entry as the first entry ("Snapback"), but the bounce is
ridden for up to seven hours instead of two.

## Run it

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot <repo-dir> --driver process
```

Run from inside the unpacked kit for this competition, pointing --bot at
this repository.

## Strategy

Buy sharp half-hour drops once the minute turns up, ride the recovery for up
to seven hours, and let a trailing stop keep the profit:

- **Entry** (flat only): the close is at least 1.5% below the close 30 bars
  ago, and the latest close is not below the previous close. Buy with all
  the cash.
- **Exit**: sell everything when the position's value falls 0.7% below its
  peak since entry (armed once the peak is 0.5% above cost), or 420 bars
  after the fill — whichever comes first.

One position at most, long only, full size. No fixed take-profit and no
fixed stop-loss: both were tested against both dev windows and both cut the
winners that pay. All decisions are exact integer math; no clock, no randomness,
no network — the bot is fully deterministic.

## Dev-window grade

Graded locally with the kit's own grader (`grade-local --driver process`):

| metric | value |
| --- | --- |
| Net PnL | **+$14.65** |
| Trades | 1 round trip (2 filled orders) |
| Max drawdown | 0.62% |
| Fees | $0.81 |

The dev window is calm (+0.49% over 24h, 60-minute returns with 0.52%
stdev): the previous race's hourly-drop winner catches one trade here and
loses $2.22, so this entry was re-tuned to the half-hour edge instead —
after a 30-minute drop of 0.8%+, the next 30 minutes average +0.22%
(median +0.34%, positive 83% of the time). The recovery after the window's
dip keeps climbing for ~400 bars, which is why the seven-hour hold beats
the two-hour hold (+$14.65 vs +$9.87). The same parameters make +$21.72 on
the previous race's dev window (3 trades), so the design earns in a calm
window and in a volatile falling one. See `EVIDENCE.md` for the full
backtest notes.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's SDK shim
- `.makefun/owner.json` — payout wallet
- `LICENSE` — MIT

---

<sub>Entered on [make.fun](https://make.fun/?ref=p5tm223q&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
