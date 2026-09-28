// meanReversion.js - règles de data/backtest-input/preregistration-mean-reversion-ibs-3down-2026-09-25.md (fonctions pures, testées dans
// test/meanReversion.test.js) : IBS et « 3 baisses de suite », journalier, achats seulement, mêmes conventions que RSI(2) en live.
// Entrée : une série M1 { t, o, h, l, c, n } en TEMPS MOTEUR (heure de New York fixe, comme loadM1).
const DAY = 86400000, H17 = 17 * 3600000;

/** Bougies journalières 17:00 -> 17:00 (temps moteur) : { time, o, h, l, c, i0, i1 } (indices M1 [i0, i1)). */
export function dailyBars(S) {
  const bars = [];
  let cur = null;
  for (let i = 0; i < S.n; i++) {
    const key = Math.floor((S.t[i] - H17) / DAY);
    if (!cur || cur.key !== key) { if (cur) bars.push(cur); cur = { key, time: key * DAY + H17, o: S.o[i], h: S.h[i], l: S.l[i], c: S.c[i], i0: i, i1: i + 1 }; continue; }
    if (S.h[i] > cur.h) cur.h = S.h[i];
    if (S.l[i] < cur.l) cur.l = S.l[i];
    cur.c = S.c[i]; cur.i1 = i + 1;
  }
  if (cur) bars.push(cur);
  return bars;
}

export const RULES = {
  ibs: {
    entry: (b, i, sma) => b[i].h > b[i].l && (b[i].c - b[i].l) / (b[i].h - b[i].l) < 0.2 && b[i].c > sma,
    exit: (b, i) => b[i].h > b[i].l && (b[i].c - b[i].l) / (b[i].h - b[i].l) > 0.8,
  },
  down3: {
    entry: (b, i, sma) => i >= 3 && b[i].c < b[i - 1].c && b[i - 1].c < b[i - 2].c && b[i - 2].c < b[i - 3].c && b[i].c > sma,
    exit: (b, i) => b[i].c > b[i - 1].c,
  },
};

/**
 * Trades d'une règle. `spreadAt(prix)` = spread ; `swapAt(fromTime, toTime, fill)` = swap par unité (négatif = coût) pour la durée tenue.
 * @returns {Array<{ entryTime, exitTime, entry, exit, stop, r, reason, days }>}
 */
export function meanReversionTrades(S, rule, { spreadAt, swapAt = () => 0, smaLen = 200, atrLen = 14, stopAtr = 3, maxDays = 10 }) {
  const B = dailyBars(S);
  const R = RULES[rule];
  const trades = [];
  let pos = null, pending = null; // pending : 'entry' (avec atr) ou 'exit', exécuté à l'ouverture du jour suivant
  const close = (exitBid, exitTime, reason) => {
    const swap = swapAt(pos.entryTime, exitTime, pos.entry);
    trades.push({ entryTime: pos.entryTime, exitTime, entry: pos.entry, exit: exitBid, stop: pos.stop, r: (exitBid - pos.entry + swap) / pos.risk, reason, days: pos.days });
    pos = null;
  };
  let smaSum = 0;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    // A) décision de la veille, à l'ouverture de ce jour
    let fromMinute = b.i0;
    if (pending?.type === 'exit' && pos) { close(S.o[b.i0], S.t[b.i0], pending.reason); pending = null; }
    else if (pending?.type === 'entry' && !pos) {
      const fill = S.o[b.i0] + spreadAt(S.o[b.i0]);
      const risk = stopAtr * pending.atr;
      pos = { entry: fill, entryTime: S.t[b.i0], stop: fill - risk, risk, days: 0 };
      pending = null;
    }
    // B) stop minute par minute (stop d'abord ; une minute qui s'ouvre sous le stop sort à son ouverture)
    if (pos) {
      for (let k = fromMinute; k < b.i1; k++) {
        if (S.l[k] <= pos.stop) { close(k > fromMinute || S.t[k] !== pos.entryTime ? Math.min(S.o[k], pos.stop) : pos.stop, S.t[k], 'stop'); break; }
      }
    }
    // C) clôture du jour : indicateurs, puis décision pour demain
    smaSum += b.c; if (i >= smaLen) smaSum -= B[i - smaLen].c;
    if (pos) {
      pos.days++;
      if (R.exit(B, i)) pending = { type: 'exit', reason: 'signal' };
      else if (pos.days >= maxDays) pending = { type: 'exit', reason: 'time' };
    } else if (i >= smaLen - 1 && i >= atrLen) {
      if (R.entry(B, i, smaSum / smaLen)) {
        let tr = 0; for (let k = i - atrLen + 1; k <= i; k++) tr += Math.max(B[k].h - B[k].l, Math.abs(B[k].h - B[k - 1].c), Math.abs(B[k].l - B[k - 1].c));
        pending = { type: 'entry', atr: tr / atrLen };
      }
    }
  }
  return trades;
}
