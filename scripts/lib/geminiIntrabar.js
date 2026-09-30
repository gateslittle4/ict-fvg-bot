// geminiIntrabar.js - règle de Gemini, ACHATS SEULEMENT, avec le rejet évalué sur des bougies de durée D (M15, M5 ou M1) au lieu de la
// seule clôture M15 (data/backtest-input/preregistration-intrabar-rejection-2026-09-30.md). Les FVG se forment toujours sur bougies M15
// fermées ; tout le reste est celui de scripts/lib/geminiFvg.js. Avec D = M15 le résultat est identique à geminiSignals (achats).
import { MIN_GAP_PCT, MAX_AGE, TARGET_LOOKBACK, STOP_MARGIN, MIN_RR } from './geminiFvg.js';

const M15 = 900000;
function sparseMax(arr) {
  const n = arr.length; const T = [Float64Array.from(arr)];
  for (let k = 1; (1 << k) <= n; k++) {
    const prev = T[k - 1]; const cur = new Float64Array(n - (1 << k) + 1); const h = 1 << (k - 1);
    for (let i = 0; i < cur.length; i++) cur[i] = Math.max(prev[i], prev[i + h]);
    T.push(cur);
  }
  return (a, b) => { const k = 31 - Math.clz32(b - a + 1); return Math.max(T[k][a], T[k][b - (1 << k) + 1]); };
}

/**
 * @param {Array<{time,open,high,low,close}>} m15 bougies M15 fermées, croissantes
 * @param {Array<{time,open,high,low,close,row}>} fine bougies de durée D, croissantes, alignées sur les M15 (`row` = ligne de règlement)
 * @returns {Array<{formedTime, entryTime, row, entryPrice, stopPrice, targetPrice}>}
 */
export function geminiBuysOnFine(m15, fine, { canTrade = () => true, spreadAt = () => 0, onSignal = () => {} } = {}) {
  const jOf = new Map(m15.map((c, j) => [c.time, j]));
  const maxHigh = sparseMax(m15.map((c) => c.high));
  const fvgs = []; let active = null; const out = [];
  let curJ = -1, curHigh = -Infinity;
  const closeBar = (j) => { // formation avec la bougie M15 j complète (B3 = j)
    if (j < 2) return;
    const b1 = m15[j - 2], k = m15[j], gap = MIN_GAP_PCT * k.close;
    if (b1.low > k.high + gap) fvgs.push({ dir: 'bearish', top: b1.low, bot: k.high, formed: j });
    if (b1.high < k.low - gap) { const f = { dir: 'bullish', top: k.low, bot: b1.high, formed: j }; fvgs.push(f); active = f; }
  };
  for (let x = 0; x < fine.length; x++) {
    const b = fine[x];
    const j = jOf.get(Math.floor(b.time / M15) * M15);
    if (j === undefined) continue;
    if (j !== curJ) { if (curJ >= 0) closeBar(curJ); curJ = j; curHigh = -Infinity; if (active && j - active.formed > MAX_AGE) active = null; }
    curHigh = Math.max(curHigh, b.high);
    const f = active;
    if (!f) continue;
    if (b.close < f.bot) { active = null; continue; }
    if (!(b.low <= f.top && b.close > f.bot)) continue;
    const nx = fine[x + 1];
    if (!nx || !canTrade(nx.time)) continue;
    const E = nx.open, h = f.top - f.bot, stop = f.bot - STOP_MARGIN * h, dist = E - stop;
    if (!(dist > 0) || dist < 3 * spreadAt(E)) continue;
    let target = null;
    for (let q = fvgs.length - 1; q >= 0; q--) {
      const g = fvgs[q];
      if (g.formed >= f.formed) continue;
      if (g.formed < f.formed - TARGET_LOOKBACK) break;
      if (g.bot <= E) continue;
      const hi = Math.max(g.formed + 1 <= j - 1 ? maxHigh(g.formed + 1, j - 1) : -Infinity, curHigh);
      if (hi >= g.top) continue; // comblé
      if (target === null || g.bot < target) target = g.bot;
    }
    if (target === null || Math.abs(E - target) < MIN_RR * dist) continue;
    const sig = { formedTime: m15[f.formed].time, entryTime: nx.time, row: nx.row, entryPrice: E, stopPrice: stop, targetPrice: target };
    out.push(sig); onSignal(sig);
    active = null;
  }
  return out;
}
