// transactionCosts.js
// Applies a realistic round-turn spread cost to already-computed backtest
// trades, expressed as a reduction in R-multiple (the standard, engine-
// agnostic way to fold in costs without re-running the simulation):
//   costR = spreadPriceUnits / trade.distance
//   netR  = grossR - costR
// This assumes the spread is paid once per round trip (effectively at
// entry), which is the standard simplifying convention — mathematically
// equivalent to a half-spread markup on both entry and exit.
//
// !!! SPREAD DEFAULTS ARE INDICATIVE, NOT CONFIRMED against FundingPips'
// actual cTrader spreads for these instruments — verify once live (same
// caveat as the lot-size specs in lotCalculator.js). A thin edge (a few
// points of win rate above breakeven) can be erased entirely by an
// under-estimated spread, so treat these numbers as a first estimate, not
// a final verdict.

export const DEFAULT_SPREADS = {
  // price units (e.g. 0.0001 = 1 pip for a 4-decimal forex pair)
  EURUSD: 0.00010, // ~1.0 pip round-turn — typical standard-account retail/prop spread
  GBPUSD: 0.00015, // ~1.5 pips — GBP pairs typically run a bit wider than EURUSD
  USDJPY: 0.012, // ~1.2 pips (1 pip = 0.01 for this pair) — INDICATIVE, verify against FundingPips cTrader spec
  US100: 1.0, // 1.0 point — INDICATIVE, verify against FundingPips cTrader spec
  US500: 0.4, // 0.4 point — INDICATIVE, verify against FundingPips cTrader spec
  XAUUSD: 0.30, // 0.30 (30 cents) — INDICATIVE typical retail/prop spot-gold spread, verify against FundingPips cTrader spec
  // 2026-09-13, Esdras: "code une stratégie crypto à déployer ce soir pour
  // voir si il va passer" - weekend connectivity smoke-test (forex/
  // indices/metals close on weekends, crypto doesn't), NOT a validated
  // strategy like the ones above. Meant to be removed after tonight's
  // test, per Esdras's own plan ("on va supprimer BTC juste après") - see
  // the matching temporary entries in config.js.
  //
  // UPDATE 2026-09-13, same night: was 25 (a pure guess - "$25 round-turn
  // on a ~$70k BTC price is a plausible order of magnitude", never
  // measured). Every single validated BTCUSD signal tonight was rejected
  // by filterViableTrades() as 'spread-too-tight' (needs distance >=
  // spread*3 = 75, but real FVG-edge stops on M1 run 6-72) - Esdras asked
  // to adjust the filter so a real trade could actually fire. Rather than
  // just lowering the guess further, fixed the REAL bug blocking
  // /admin/spread-check from ever recording a tick (see cTraderDataSource.js's
  // ProtoOASpotEvent handler - bid/ask were being read with a strict
  // `typeof === 'number'` check that silently failed whenever this broker
  // sent them as numeric strings, same pattern as several other bugs found
  // tonight) and measured the REAL spread: 34 samples, min 17, max 18, avg
  // 17.03 - the old guess (25) was ~47% too high. 18 (the observed max, a
  // deliberately conservative choice over the average) replaces it here -
  // this is now a measured number, not a guess, even though the strategy
  // itself is still just a smoke test.
  BTCUSD: 18,
};

/**
 * Drops trades whose stop distance is too small relative to the spread to be
 * realistically tradeable — e.g. a 0.3-pip stop on a 1-pip-spread pair means
 * the spread alone is several times your intended risk, which no real broker
 * fill makes viable regardless of the strategy's "edge" on paper.
 * @param {number} minMultiple - minimum acceptable distance/spread ratio (e.g. 3)
 */
export function filterViableTrades(trades, spreadPriceUnits, minMultiple = 3) {
  if (!spreadPriceUnits) return trades; // no spread configured for this symbol - can't judge viability, keep all
  const minDistance = spreadPriceUnits * minMultiple;
  return trades.filter((t) => t.distance >= minDistance);
}

/**
 * Each traded unit pays its own round-turn spread on entry - a normal
 * single-unit trade pays it once, but a pyramided trade (see
 * runBacktestManaged()'s 'pyramid' mode, `unitsDeployed: 2`) opened a SECOND
 * position and must pay the spread again for that fill. `t.unitsDeployed`
 * (defaults to 1 when absent, e.g. plain runBacktest() trades) scales the
 * cost accordingly so pyramided trades aren't undercharged.
 */
export function applyTransactionCosts(trades, spreadPriceUnits) {
  return trades.map((t) => {
    const units = t.unitsDeployed ?? 1;
    const costR = (spreadPriceUnits / t.distance) * units;
    return { ...t, grossRMultiple: t.rMultiple, costR, rMultiple: t.rMultiple - costR };
  });
}
