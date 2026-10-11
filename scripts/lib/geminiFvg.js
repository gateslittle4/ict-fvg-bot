// geminiFvg.js - signaux du « cahier des charges 100 % FVG » de Gemini, tels que figés dans
// data/backtest-input/preregistration-gemini-fvg-2026-09-30.md (précisions 1 à 7). Fonction pure sur un tableau de bougies M15
// { time, open, high, low, close } ; le règlement (spread, swap, stop d'abord) est fait par scripts/lib/stopOrderEntry.js#manage.

export const MIN_GAP_PCT = 0.0002; // 0,02 % du prix
export const MAX_AGE = 50; // CONFIG.fvg.maxAgeCandles
export const TARGET_LOOKBACK = 480; // bougies M15 avant le FVG d'exécution
export const STOP_MARGIN = 0.1; // 10 % de la hauteur de zone (convention fvg-edge)
export const MIN_RR = 1;

/** Table creuse pour min/max sur intervalle [a, b] inclus. */
function sparse(arr, pick) {
  const n = arr.length; const T = [Float64Array.from(arr)];
  for (let k = 1; (1 << k) <= n; k++) {
    const prev = T[k - 1]; const cur = new Float64Array(n - (1 << k) + 1); const h = 1 << (k - 1);
    for (let i = 0; i < cur.length; i++) cur[i] = pick(prev[i], prev[i + h]);
    T.push(cur);
  }
  return (a, b) => { const k = 31 - Math.clz32(b - a + 1); return pick(T[k][a], T[k][b - (1 << k) + 1]); };
}

/**
 * @returns {Array<{ dir:'bullish'|'bearish', rejectIndex:number, entryIndex:number, entryPrice:number, stopPrice:number,
 *   targetPrice:number, zone:{top,bot}, formedIndex:number }>} un signal par bougie de rejet ; l'entrée est l'ouverture de la bougie
 *   suivante. `canTrade(i)` (optionnel) : false si une position est déjà ouverte à la bougie i - le FVG reste alors actif.
 *   `onSignal(sig)` est appelé aussitôt, pour que l'appelant règle le trade avant le prochain `canTrade`.
 */
export function geminiSignals(c, { canTrade = () => true, spreadAt = () => 0, onSignal = () => {} } = {}) {
  const n = c.length;
  const minLow = sparse(c.map((x) => x.low), Math.min);
  const maxHigh = sparse(c.map((x) => x.high), Math.max);
  const fvgs = []; // { dir, top, bot, formed }
  const active = { bearish: null, bullish: null };
  const out = [];
  for (let j = 2; j < n - 1; j++) {
    const k = c[j];
    // 1) Rejet sur le FVG d'exécution actif (formé AVANT cette bougie), puis invalidations.
    for (const dir of ['bearish', 'bullish']) {
      const f = active[dir];
      if (!f) continue;
      if (j - f.formed > MAX_AGE) { active[dir] = null; continue; }
      const bear = dir === 'bearish';
      if (bear ? k.close > f.top : k.close < f.bot) { active[dir] = null; continue; }
      const touched = bear ? k.high >= f.bot : k.low <= f.top;
      const rejected = bear ? k.close < f.top : k.close > f.bot;
      if (!touched || !rejected || !canTrade(j + 1)) continue;
      const E = c[j + 1].open;
      const h = f.top - f.bot;
      const stop = bear ? f.top + STOP_MARGIN * h : f.bot - STOP_MARGIN * h;
      const dist = bear ? stop - E : E - stop;
      if (!(dist > 0) || dist < 3 * spreadAt(E)) continue;
      // Objectif : FVG non comblé le plus proche, entièrement du côté de l'objectif, formé dans les 480 bougies avant f.
      let target = null;
      for (let q = fvgs.length - 1; q >= 0; q--) {
        const g = fvgs[q];
        if (g.formed >= f.formed) continue;
        if (g.formed < f.formed - TARGET_LOOKBACK) break;
        if (bear ? g.top >= E : g.bot <= E) continue;
        // non comblé : le prix n'a jamais atteint le bord éloigné entre la formation et la bougie de rejet incluse
        const filled = g.formed + 1 <= j && (bear ? minLow(g.formed + 1, j) <= g.bot : maxHigh(g.formed + 1, j) >= g.top);
        if (filled) continue;
        const edge = bear ? g.top : g.bot;
        if (target === null || (bear ? edge > target : edge < target)) target = edge;
      }
      if (target === null || Math.abs(E - target) < MIN_RR * dist) continue;
      const sig = { dir, formedIndex: f.formed, rejectIndex: j, entryIndex: j + 1, entryPrice: E, stopPrice: stop, targetPrice: target, zone: { top: f.top, bot: f.bot } };
      out.push(sig);
      onSignal(sig); // règlement synchrone par l'appelant (met à jour ce que canTrade voit)
      active[dir] = null; // un trade par FVG
    }
    // 2) Nouveau FVG formé par cette bougie (B3 = j) : devient le FVG d'exécution de son sens.
    const b1 = c[j - 2]; const gap = MIN_GAP_PCT * k.close;
    if (b1.low > k.high + gap) { const f = { dir: 'bearish', top: b1.low, bot: k.high, formed: j }; fvgs.push(f); active.bearish = f; }
    if (b1.high < k.low - gap) { const f = { dir: 'bullish', top: k.low, bot: b1.high, formed: j }; fvgs.push(f); active.bullish = f; }
  }
  return out;
}
