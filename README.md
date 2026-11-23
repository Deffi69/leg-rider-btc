# leg-rider-btc

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/Deffi69/leg-rider-btc/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/Deffi69/leg-rider-btc/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Leg Rider — a BTC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty ($50 USDC). It trades Coinbase Wrapped BTC (cbBTC) on 1-minute on-chain prices with $1,000 of paper money. It trades rarely on purpose: on one-minute bars the market is mostly noise and a full round trip costs about 26 bps, so it waits for a real leg, rides it with all of its cash, and sells only when the trend is confirmed broken.

## How it works

- **Entry (once per run):** the 30-bar return reaches +0.25% on two consecutive bars while the close sits above the 100-bar EMA. Then it buys with 100% of its cash.
- **Exit (whole position):** the 30-bar return falls to −1.2%, the 60-bar return to −1.5%, the price closes under the 200-bar EMA for 20 bars in a row, or a 2.5% trailing stop from the peak close since entry is hit.
- **After an exit it stays in cash** — re-entering into chop is what bleeds a 1-minute bot dry.
- Fully deterministic: every decision is a pure function of the closes seen so far. No clock, no environment, no randomness.

## Results on the dev window

Backtested on the published dev window (1,440 one-minute cbBTC bars, the 24 hours ending at the competition opening):

| Bot | Net PnL | Trades | Max drawdown |
| --- | --- | --- | --- |
| **Leg Rider** | **+$23.64** | 2 | 1.81% |
| buy-and-hold (kit baseline) | +$32.17 | 1 | 1.98% |
| momentum (kit baseline) | +$34.94 | 1 | 1.98% |
| EMA-cross (kit baseline) | −$114.83 | 76 | 11.65% |

Leg Rider gives up some upside to buy-and-hold on a rising day, but it protects the downside: the same rules on the dev window played backwards (a −3.5% down-trend) lose only $12.03, and on the same bars shuffled hour by hour (pure chop) lose $14.06 — bounded, because the exits cut the position instead of riding it down. The dev gate only needs a net PnL above $0, which this clears with room to spare.

## Run it

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot <this-repo> --driver docker
```

The bot is `main.ts` (Node 22, erasable TypeScript, standard library only). `vendor/makefun-bars.ts` is a byte-identical copy of the kit's SDK shim.

---

<sub>Entered on [make.fun](https://make.fun/?ref=eaffd4np&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>

---
