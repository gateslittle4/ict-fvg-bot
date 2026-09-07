// correlation.js
// Pairwise Pearson correlation of M15 returns across instruments, aligned on
// shared timestamps only (handles different trading sessions/holidays
// between indices and forex pairs gracefully - just uses less overlap data
// rather than fabricating a value for missing bars).
//
// Purpose: turn "US100 and US500 are probably correlated" into an actual
// number computed from the user's own data, to inform which pairs to
// combine live without accidentally concentrating risk instead of
// diversifying it.

export function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n === 0 || n !== ys.length) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    denX = 0,
    denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

/**
 * @param {Record<string, Array<{time:number, close:number}>>} symbolCandlesMap
 * @param {number} [minOverlap] - minimum number of common timestamps required to trust a pair's correlation
 * @returns {{matrix: Record<string, Record<string, number|null>>, overlapCounts: Record<string, Record<string, number>>}}
 */
export function computeCorrelationMatrix(symbolCandlesMap, minOverlap = 30) {
  const symbols = Object.keys(symbolCandlesMap);
  const closeMaps = {};
  for (const s of symbols) {
    const m = new Map();
    for (const c of symbolCandlesMap[s]) m.set(c.time, c.close);
    closeMaps[s] = m;
  }

  const matrix = {};
  const overlapCounts = {};

  for (const a of symbols) {
    matrix[a] = {};
    overlapCounts[a] = {};
    for (const b of symbols) {
      if (a === b) {
        matrix[a][b] = 1;
        overlapCounts[a][b] = closeMaps[a].size;
        continue;
      }
      const common = [...closeMaps[a].keys()].filter((t) => closeMaps[b].has(t)).sort((x, y) => x - y);
      overlapCounts[a][b] = common.length;
      if (common.length < minOverlap) {
        matrix[a][b] = null;
        continue;
      }
      const retA = [];
      const retB = [];
      for (let i = 1; i < common.length; i++) {
        const t0 = common[i - 1];
        const t1 = common[i];
        const a0 = closeMaps[a].get(t0);
        const a1 = closeMaps[a].get(t1);
        const b0 = closeMaps[b].get(t0);
        const b1 = closeMaps[b].get(t1);
        if (a0 === 0 || b0 === 0) continue;
        retA.push((a1 - a0) / a0);
        retB.push((b1 - b0) / b0);
      }
      matrix[a][b] = pearsonCorrelation(retA, retB);
    }
  }

  return { matrix, overlapCounts };
}

// ---- Shared pairs-Divergence helpers ----
// Extracted 2026-09 from scripts/runFtmo1StepAccountImpact.js /
// runDivergenceStrategyAnalysis.js, where both had their own untested,
// copy-pasted version of this logic. Behavior is unchanged (same rolling
// z-score, same time-alignment by exact timestamp match) - this is a pure
// dedup + test-coverage fix, not a new mechanism, so it doesn't touch any
// already-validated result.

/**
 * Rolling z-score of a series, using only the PRIOR `lookback` values at
 * each point (never the current one - no lookahead). `z[i]` is null until
 * index `lookback`.
 * @param {number[]} series
 * @param {number} lookback
 * @returns {Array<number|null>}
 */
export function computeZScoreSeries(series, lookback) {
  const z = new Array(series.length).fill(null);
  for (let i = lookback; i < series.length; i++) {
    let sum = 0;
    for (let j = i - lookback; j < i; j++) sum += series[j];
    const mean = sum / lookback;
    let sqSum = 0;
    for (let j = i - lookback; j < i; j++) sqSum += (series[j] - mean) ** 2;
    const std = Math.sqrt(sqSum / lookback);
    z[i] = std > 0 ? (series[i] - mean) / std : 0;
  }
  return z;
}

/**
 * Aligns two candle arrays to their common timestamps only, preserving
 * order. Used to line up two instruments' candles (e.g. different session
 * gaps/holidays) before computing a joint series like a log-ratio.
 * @param {Array<{time:number}>} candlesA
 * @param {Array<{time:number}>} candlesB
 * @returns {{alignedA: Array, alignedB: Array}}
 */
export function alignByTime(candlesA, candlesB) {
  const mapB = new Map(candlesB.map((c) => [c.time, c]));
  const alignedA = [];
  const alignedB = [];
  for (const a of candlesA) {
    const b = mapB.get(a.time);
    if (b) {
      alignedA.push(a);
      alignedB.push(b);
    }
  }
  return { alignedA, alignedB };
}
