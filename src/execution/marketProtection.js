// marketProtection.js - pure, shared by the bot (cTraderDataSource.js) and the faithful replay through entryPolicy.js (moved out of
// cTraderDataSource.js on 2026-09-24, unchanged).

/**
 * Compensates a MARKET order's spread-shifted protection (2026-09-21, found after the first real EURUSD trade).
 *
 * A MARKET order can only carry RELATIVE stop/target distances, anchored on the FILL price (see toRelativeProtectionDistance). A buy fills at the
 * ask (= bid + spread) but its stop/target trigger on the bid, so a stop `d` below the fill sits only `d - spread` below the bid the backtest
 * (bid candles) tested, and the target `T` above sits `T + spread` away: the stop is tighter and the target farther than the strategy's own
 * levels. A sell fills at the bid and triggers on the ask: same shift. Measured on 4 years of M1 (data/backtest-input/order-geometry-live-vs-backtest.md)
 * that costs ~17 % of the edge (+266 R live geometry vs +322 R strategy levels).
 *
 * Returned prices are what to pass as stopLoss/takeProfit together with referencePrice = the signal's entry price, so the relative distances
 * become d + spread (stop) and T - spread (target): anchored on the expected fill they land on the strategy's own levels. `stopPrice` for sizing
 * is the same widened stop, so the worst-case loss stays the planned risk. A missing/invalid spread, or one that would invert the target, returns
 * the inputs untouched (the previous behaviour).
 */
export function adjustMarketProtectionForSpread({ side, entryPrice, stopPrice, targetPrice, spread }) {
  const s = Number(spread);
  const untouched = { stopPrice, targetPrice, spreadApplied: 0 };
  if (!Number.isFinite(s) || s <= 0) return untouched;
  const isBuy = String(side).toLowerCase() === 'buy';
  const stopDist = Math.abs(entryPrice - stopPrice);
  if (!(stopDist > 0) || s > stopDist / 2) return untouched;
  // 2026-09-22 (RSI(2)/US500 daily, Esdras: "on le code" - see dailyAlertEngine.js): this strategy has NO fixed target - it exits on its own
  // signal (SMA5 recovery / time-out), not on a price level. Widen the stop only in that case; a real target still gets pulled in as before.
  if (targetPrice == null) return { stopPrice: isBuy ? stopPrice - s : stopPrice + s, targetPrice: null, spreadApplied: s };
  const targetDist = Math.abs(targetPrice - entryPrice);
  if (targetDist - s <= 0) return untouched;
  return {
    stopPrice: isBuy ? stopPrice - s : stopPrice + s,
    targetPrice: isBuy ? targetPrice - s : targetPrice + s,
    spreadApplied: s,
  };
}
