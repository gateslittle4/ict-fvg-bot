// liveCheck.js - rapprochement trade par trade entre les trades RÉELS du bot (GET /api/trade-history) et le rejeu fidèle
// (runLiveReplay.js) sur la même semaine. Pur, testé dans test/liveCheck.test.js ; utilisé par scripts/runWeeklyLiveCheck.js.

// Sources qui ouvrent leurs propres positions en live mais que le rejeu du combo ne simule pas (A et B : leur étude a son propre moteur).
export const NOT_REPLAYED_SOURCES = new Set(['orb5', 'noise']);
// Sources qui tiennent la place de la paire en live (une seule position par paire) - un trade du rejeu absent en réel pendant
// qu'une de ces positions était ouverte s'explique par ce blocage, que le rejeu ne connaît pas.
export const SLOT_HOLDERS = new Set(['orb5', 'noise']);

/**
 * @param {Array<{symbol, source, direction, entryTime, exitTime, rMultiple}>} live - trades réels (heures UTC en ms)
 * @param {Array<{symbol, source, direction, entryTime, exitTime, r}>} replay - trades du rejeu (heures UTC en ms)
 * @param {{ replayedSymbols: string[], toleranceMs?: number }} opts
 * @returns {Array<{status, symbol, source, direction, liveEntry, replayEntry, liveR, replayR, note}>} trié par heure
 *   status : 'identique' (même paire, stratégie, sens, entrée à moins de `toleranceMs`), 'réel seulement', 'rejeu seulement',
 *   'hors rejeu' (paire ou stratégie que le rejeu ne simule pas).
 */
export function matchLiveAndReplay(live, replay, { replayedSymbols, toleranceMs = 20 * 60000 }) {
  const rows = [];
  const used = new Set();
  const replayed = new Set(replayedSymbols);
  for (const t of live) {
    if (!replayed.has(t.symbol) || NOT_REPLAYED_SOURCES.has(t.source) || !t.source) {
      rows.push({ status: 'hors rejeu', symbol: t.symbol, source: t.source, direction: t.direction, liveEntry: t.entryTime, replayEntry: null, liveR: t.rMultiple ?? null, replayR: null,
        note: !t.source ? 'trade sans stratégie (manuel ?)' : NOT_REPLAYED_SOURCES.has(t.source) ? 'A/B : moteur à part' : `${t.symbol} absent du rejeu` });
      continue;
    }
    let best = -1, bestDiff = Infinity;
    replay.forEach((r, i) => {
      if (used.has(i) || r.symbol !== t.symbol || r.source !== t.source || r.direction !== t.direction) return;
      const d = Math.abs(r.entryTime - t.entryTime);
      if (d <= toleranceMs && d < bestDiff) { best = i; bestDiff = d; }
    });
    if (best < 0) { rows.push({ status: 'réel seulement', symbol: t.symbol, source: t.source, direction: t.direction, liveEntry: t.entryTime, replayEntry: null, liveR: t.rMultiple ?? null, replayR: null, note: '' }); continue; }
    used.add(best);
    const r = replay[best];
    rows.push({ status: 'identique', symbol: t.symbol, source: t.source, direction: t.direction, liveEntry: t.entryTime, replayEntry: r.entryTime, liveR: t.rMultiple ?? null, replayR: r.r, note: '' });
  }
  replay.forEach((r, i) => {
    if (used.has(i)) return;
    const holder = live.find((t) => SLOT_HOLDERS.has(t.source) && t.symbol === r.symbol && t.entryTime <= r.entryTime && t.exitTime > r.entryTime);
    rows.push({ status: 'rejeu seulement', symbol: r.symbol, source: r.source, direction: r.direction, liveEntry: null, replayEntry: r.entryTime, liveR: null, replayR: r.r,
      note: holder ? `en réel, la paire était tenue par ${holder.source}` : '' });
  });
  return rows.sort((a, b) => (a.liveEntry ?? a.replayEntry) - (b.liveEntry ?? b.replayEntry));
}

/** Totaux d'une semaine, sur le périmètre commun (trades que le rejeu simule). */
export function summarizeCheck(rows) {
  const inScope = rows.filter((r) => r.status !== 'hors rejeu');
  const sum = (l, k) => l.reduce((a, r) => a + (Number.isFinite(r[k]) ? r[k] : 0), 0);
  const n = (s) => rows.filter((r) => r.status === s).length;
  const noLiveR = inScope.filter((r) => r.status !== 'rejeu seulement' && !Number.isFinite(r.liveR)).length;
  return { identical: n('identique'), liveOnly: n('réel seulement'), replayOnly: n('rejeu seulement'), outOfScope: n('hors rejeu'), liveR: sum(inScope, 'liveR'), replayR: sum(inScope, 'replayR'), liveRMissing: noLiveR };
}

/** Fusionne des bougies (par heure), les plus récentes remplaçant les anciennes. */
export function mergeCandles(oldC, newC) {
  const m = new Map(oldC.map((c) => [c.time, c]));
  for (const c of newC) m.set(c.time, c);
  return [...m.values()].sort((a, b) => a.time - b.time);
}
