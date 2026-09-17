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
  // 2026-09-15: Esdras sent a Market Watch screenshot of her real cTrader
  // account (GBPUSD/EURUSD/GER40/US100/US30/US500 side by side) - same
  // single-snapshot caveat as GER40 below (not an average over time), but
  // real broker numbers instead of guesses for these 4.
  EURUSD: 0.00011, // Sell 1.15321 / Buy 1.15332 — was 0.00010 (close guess)
  GBPUSD: 0.00015, // Sell 1.34683 / Buy 1.34698 — matches the prior guess exactly
  USDJPY: 0.012, // ~1.2 pips (1 pip = 0.01 for this pair) — INDICATIVE, verify against FundingPips cTrader spec
  // 2026-09-15, Esdras uploaded real HistData USDCAD M1 (2010-2018,
  // 2020-2025) to research a genuinely new pair - same indicative-spread
  // convention as every other pair here, not yet confirmed against a real
  // broker spec. ~1.5 pips, matching GBPUSD's convention (a major pair, not
  // exotic - similar liquidity profile to EURUSD/GBPUSD, not USDJPY's
  // different pip scale).
  USDCAD: 0.00015, // ~1.5 pips — INDICATIVE, never confirmed against a real broker spec
  // 2026-09-17, Esdras uploaded real HistData NZDJPY M1 (2019-2025) to
  // research a genuinely new instrument. Deliberately NOT left absent from
  // this table - that exact gap (a symbol missing here silently costs
  // ZERO via `DEFAULT_SPREADS[symbol] ?? 0`) is the specific bug already
  // found and fixed for USDJPY (see its own comment above): the first pass
  // showed suspiciously good numbers before that fix. Same 2-decimal pip
  // scale as USDJPY (1 pip = 0.01), but NZDJPY is a cross between two
  // lower-liquidity currencies (NZD/JPY), not a major - retail spreads run
  // noticeably wider than USDJPY's ~1.2 pips. No live broker quote
  // available (never connected/traded), so this is a conservative estimate
  // (erring toward overstating cost, same discipline as GER40/BTCUSD's own
  // "pick the higher end, not the average" choices) rather than a guess at
  // the tight end - INDICATIVE, verify against a real broker spec before
  // ever trusting a thin edge here.
  NZDJPY: 0.04, // ~4 pips — INDICATIVE, conservative estimate for a JPY cross, never confirmed against a real broker spec
  // 2026-09-17, Esdras uploaded real HistData AUDUSD M1 (2019-2025) -
  // checked BEFORE running anything, same discipline as NZDJPY just above
  // (a missing entry here silently prices every trade at zero cost via the
  // `?? 0` fallback - the exact bug already found for USDJPY). AUDUSD is a
  // MAJOR pair, not a cross - comparable liquidity to EURUSD/GBPUSD/USDCAD,
  // so reusing their exact convention (~1.5 pips) rather than NZDJPY's
  // wider cross-pair estimate.
  AUDUSD: 0.00015, // ~1.5 pips — INDICATIVE, matching EURUSD/GBPUSD/USDCAD's convention for a major pair, never confirmed against a real broker spec
  US100: 0.6, // Sell 29074.45 / Buy 29075.05 — was 1.0, a 67% overestimate
  US500: 0.25, // Sell 7605.47 / Buy 7605.72 — was 0.4, a 60% overestimate
  XAUUSD: 0.30, // 0.30 (30 cents) — INDICATIVE typical retail/prop spot-gold spread, verify against FundingPips cTrader spec
  // 2026-09-15, Esdras uploaded real HistData GRXEUR M1 (2010-2025) to
  // research a genuinely new instrument - the DAX40 index. Was 1.0 (a pure
  // guess, same indicative convention as US100/US500). UPDATE same day:
  // Esdras sent a screenshot of GER40 in her real cTrader account -
  // Sell 25452.5 / Buy 25453.0 - a single observed snapshot, not an
  // average like BTCUSD's measured spread, but a real broker number
  // rather than a guess. Exactly half the previous estimate.
  GER40: 0.5, // 0.5 point — single real observation from Esdras's cTrader account, not yet averaged over time
  // BTCUSD's entry (18) was removed 2026-09-16 with the symbol itself - see
  // config.js's `symbols` comment. Keeping the measurement on record here
  // because it was real work and would otherwise have to be redone if crypto
  // is ever revisited: 34 live ticks sampled 2026-09-13 via
  // /admin/spread-check gave min 17, max 18, avg 17.03, so 18 (the observed
  // max, conservative) replaced the original pure guess of 25 - which had
  // been ~47% too high and was silently rejecting every real signal as
  // 'spread-too-tight'. Note the sampling endpoint itself was broken until
  // that same session: it read bid/ask behind a `typeof === 'number'` guard
  // and this broker sends them as numeric STRINGS - the identical trap that
  // later hid the balance bug in cTraderDataSource.js's _loadBalance.
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
