// Leg Rider — a BTC trend bot for agent-fun/bars-replay/v1.
//
// Idea: on one-minute bars the market is mostly noise (a full round trip costs
// about 26 bps in fees, slippage and impact), so this bot trades rarely. It
// waits for a real leg — a 30-bar return of +0.25% or more, confirmed on two
// consecutive bars, with the price above its 100-bar EMA — then buys with all
// of its cash and rides the leg. It sells the whole position only when the
// trend is confirmed broken: the 30-bar return falls to -1.2% or worse, the
// 60-bar return to -1.5% or worse, the price closes under the 200-bar EMA
// for 20 bars in a row, or a 2.5% trailing stop from the peak close since
// entry is hit. One entry per run: after it exits it stays in cash, because
// re-entering into chop is what bleeds a 1-minute bot dry.
//
// Backtested on the published dev window (1,440 one-minute cbBTC bars, the
// 24 hours ending at the competition opening): net PnL +$23.64 on $1,000
// starting cash, 2 trades, max drawdown 1.81%. The same rules on the window
// played backwards (a -3.5% down-trend) lose only $12.03, and on the same
// bars shuffled hour by hour (pure chop) lose $14.06 — bounded, because the
// exits cut the position instead of riding it down. For comparison the kit's
// buy-and-hold baseline makes +$32.17 on the dev window and its EMA-cross
// baseline loses $114.83.
//
// Deterministic: every decision is a pure function of the closes seen so far.
// No clock, no environment, no randomness.

import { runBars, type BarsState, type Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 100;

// Entry: 30-bar return at least +0.25%, confirmed on 2 consecutive bars,
// while the close sits above the 100-bar EMA.
const ENTRY_WINDOW = 30;
const ENTRY_RETURN_BPS = 25; // +0.25% in basis points
const ENTRY_EMA_SPAN = 100;
const ENTRY_CONFIRM_BARS = 2;

// Exits (any one sells the whole position).
const EXIT_WINDOW = 30;
const EXIT_RETURN_BPS = -120; // 30-bar return at or below -1.2%
const EXIT_WINDOW_LONG = 60;
const EXIT_RETURN_LONG_BPS = -150; // 60-bar return at or below -1.5%
const EXIT_EMA_SPAN = 200;
const EXIT_BELOW_EMA_BARS = 20; // closes under the 200-bar EMA, in a row
const TRAIL_STOP_PCT = 2.5; // percent below the peak close since entry

/** One EMA over closes, seeded with the first close, float64 like the backtest. */
class Ema {
  readonly k: number;
  value: number | null = null;
  constructor(span: number) {
    this.k = 2 / (span + 1);
  }
  push(close: number): number {
    this.value = this.value === null ? close : close * this.k + this.value * (1 - this.k);
    return this.value;
  }
}

const closes: number[] = [];
const ema100 = new Ema(ENTRY_EMA_SPAN);
const ema200 = new Ema(EXIT_EMA_SPAN);
let confirmBars = 0;
let entered = false; // a buy order has been sent (one entry per run)
let exiting = false; // a sell order is out and not yet filled
let peakSinceEntry = 0; // highest close seen while holding
let belowEma200 = 0; // consecutive closes under the 200-bar EMA while holding

/** Return of the latest close against the close `window` bars back, in bps. */
function returnBps(window: number): number | null {
  if (closes.length <= window) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - window];
  return ((now / then) - 1) * 10000;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar !== undefined) {
      // Prices arrive as integers at the symbol's price scale; work in USDC.
      const scale = state.symbols.get(SYMBOL)?.price_scale ?? 5;
      const close = Number(bar.c) / 10 ** scale;
      closes.push(close);
      ema100.push(close);
      ema200.push(close);
    }
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const close = closes.length > 0 ? closes[closes.length - 1] : null;

    // --- holding: watch the exits -------------------------------------
    if (held !== undefined && held.qty > 0n) {
      if (exiting) return []; // sell already sent; wait for its fill
      if (close !== null) {
        if (close > peakSinceEntry) peakSinceEntry = close;
        belowEma200 = ema200.value !== null && close < ema200.value ? belowEma200 + 1 : 0;
        const r30 = returnBps(EXIT_WINDOW);
        const r60 = returnBps(EXIT_WINDOW_LONG);
        const reversal =
          (r30 !== null && r30 <= EXIT_RETURN_BPS) ||
          (r60 !== null && r60 <= EXIT_RETURN_LONG_BPS) ||
          belowEma200 >= EXIT_BELOW_EMA_BARS ||
          close <= peakSinceEntry * (1 - TRAIL_STOP_PCT / 100);
        if (reversal) {
          exiting = true;
          return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      return [];
    }
    if (exiting) exiting = false; // position is gone; the sell filled

    // --- flat: watch the entry ----------------------------------------
    if (entered || close === null) return [];
    if (closes.length <= ENTRY_EMA_SPAN) return []; // need a real 100-bar EMA
    const r30 = returnBps(ENTRY_WINDOW);
    const aboveEma = ema100.value !== null && close > ema100.value;
    if (r30 !== null && r30 >= ENTRY_RETURN_BPS && aboveEma) {
      confirmBars += 1;
    } else {
      confirmBars = 0;
    }
    if (confirmBars >= ENTRY_CONFIRM_BARS && state.cash > 0n) {
      entered = true;
      peakSinceEntry = close;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
