// tradeStats.js
// Every statistic the "Ma stratégie live" analysis shows, in one pure module that
// runs BOTH on the server (tests, labAnalytics) and in the browser (served at
// /shared/tradeStats.js): the page slices the trade list itself, instantly, in any
// combination, so the numbers are computed by the very code the tests cover.
//
// A trade here is { entryTime, exitTime, r, direction:'bullish'|'bearish',
// outcome:'win'|'loss'|'timeout', distance, entryPrice, holdCandles } with times in
// ENGINE time (fixed UTC-5, see nySession.js) and r = result in R net of costs.

const HOUR = 3600000;
const DAY = 24 * HOUR;
const M15 = 15 * 60000;

/**
 * The average result with its 95 % interval and how many more trades it would
 * take to be sure it is above zero. Normal approximation (fine from ~30 trades,
 * no interval under 10); trades are treated as independent, which overlapping
 * trades are not quite - read the interval as slightly optimistic.
 * @param {Array<number|{rMultiple?:number, r?:number}>} results
 */
export function expectancyStats(results) {
  const xs = results.map((t) => (typeof t === 'number' ? t : t?.rMultiple ?? t?.r)).filter((x) => Number.isFinite(x));
  const n = xs.length;
  if (n === 0) return { n: 0, mean: null, sd: null, ci95: null, significant: false, tradesToConfirm: null, moreTradesNeeded: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 10) return { n, mean, sd: null, ci95: null, significant: false, tradesToConfirm: null, moreTradesNeeded: null };
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
  const half = 1.96 * (sd / Math.sqrt(n));
  const ci95 = [mean - half, mean + half];
  const tradesToConfirm = mean > 0 && sd > 0 ? Math.ceil((1.96 * sd / mean) ** 2) : null;
  return {
    n, mean, sd, ci95,
    significant: ci95[0] > 0,
    tradesToConfirm,
    moreTradesNeeded: tradesToConfirm === null ? null : Math.max(0, tradesToConfirm - n),
  };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const byExit = (a, b) => (a.exitTime ?? a.entryTime) - (b.exitTime ?? b.entryTime);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Longest run and full distribution of consecutive wins / losses (a break-even trade ends a run). */
export function streaks(trades) {
  const ordered = [...trades].sort(byExit);
  const win = new Map();
  const loss = new Map();
  let curKind = null;
  let cur = 0;
  const flush = () => {
    if (curKind === 'win') win.set(cur, (win.get(cur) ?? 0) + 1);
    if (curKind === 'loss') loss.set(cur, (loss.get(cur) ?? 0) + 1);
  };
  for (const t of ordered) {
    const kind = t.r > 0 ? 'win' : t.r < 0 ? 'loss' : null;
    if (kind !== null && kind === curKind) cur++;
    else { flush(); curKind = kind; cur = kind ? 1 : 0; }
  }
  flush();
  const longest = (m) => [...m.keys()].reduce((a, b) => Math.max(a, b), 0);
  const dist = (m) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([length, count]) => ({ length, count }));
  return { longestWin: longest(win), longestLoss: longest(loss), winRuns: dist(win), lossRuns: dist(loss) };
}

/** Cumulative R and the distance below its own peak, trade by trade (exit order). */
export function equityCurve(trades) {
  let eq = 0;
  let peak = 0;
  return [...trades].sort(byExit).map((t) => {
    eq += t.r;
    if (eq > peak) peak = eq;
    return { time: t.exitTime ?? t.entryTime, cumulativeR: eq, drawdownR: peak - eq };
  });
}

/** Deepest drawdown (in R) and the longest stretch, in trades, spent below a previous peak. */
function drawdownStats(trades) {
  const curve = equityCurve(trades);
  let maxDd = 0;
  let longestUnderwater = 0;
  let run = 0;
  for (const p of curve) {
    if (p.drawdownR > maxDd) maxDd = p.drawdownR;
    if (p.drawdownR > 0) { run++; if (run > longestUnderwater) longestUnderwater = run; } else run = 0;
  }
  return { maxDrawdownR: maxDd, longestUnderwaterTrades: longestUnderwater, currentDrawdownR: curve.length ? curve[curve.length - 1].drawdownR : 0 };
}

/**
 * The whole statistic pack for one list of trades.
 * @returns {object|null} null when there is nothing to summarise
 */
export function summarize(trades) {
  const n = trades.length;
  if (n === 0) return null;
  const rs = trades.map((t) => t.r);
  const wins = trades.filter((t) => t.r > 0);
  const losses = trades.filter((t) => t.r < 0);
  const winSum = sum(wins.map((t) => t.r));
  const lossSum = sum(losses.map((t) => t.r));
  const totalR = sum(rs);
  const mean = totalR / n;
  const winRate = wins.length / n;
  const avgWin = wins.length ? winSum / wins.length : null;
  const avgLoss = losses.length ? lossSum / losses.length : null;
  const payoff = avgWin !== null && avgLoss !== null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;
  const exp = expectancyStats(rs);
  const downside = Math.sqrt(sum(rs.map((r) => (r < 0 ? r * r : 0))) / n);
  const st = streaks(trades);
  const dd = drawdownStats(trades);
  const times = trades.map((t) => t.entryTime);
  const first = Math.min(...times);
  const last = Math.max(...times);
  const months = Math.max(1, (last - first) / (30.44 * DAY));
  return {
    n, wins: wins.length, losses: losses.length, timeouts: trades.filter((t) => t.outcome === 'timeout').length,
    winRate, avgWinR: avgWin, avgLossR: avgLoss, payoff,
    expectancy: exp, totalR,
    medianR: median(rs), bestR: Math.max(...rs), worstR: Math.min(...rs), sd: exp.sd,
    profitFactor: lossSum < 0 ? winSum / Math.abs(lossSum) : null,
    sharpePerTrade: exp.sd ? mean / exp.sd : null,
    sortinoPerTrade: downside > 0 ? mean / downside : null,
    // Fraction of capital the Kelly formula would risk per trade; > 0 only when there is an edge (informational, never a sizing advice).
    kelly: payoff ? winRate - (1 - winRate) / payoff : null,
    longestWinStreak: st.longestWin, longestLossStreak: st.longestLoss,
    maxDrawdownR: dd.maxDrawdownR, longestUnderwaterTrades: dd.longestUnderwaterTrades, currentDrawdownR: dd.currentDrawdownR,
    avgHoldHours: (sum(trades.map((t) => t.holdCandles ?? 0)) * M15) / HOUR / n,
    tradesPerMonth: n / months,
    probLossStreak: { 3: (1 - winRate) ** 3, 5: (1 - winRate) ** 5, 8: (1 - winRate) ** 8 },
    firstTime: first, lastTime: last,
  };
}

/** Rolling average R over the last `window` trades. */
export function rolling(trades, window = 50) {
  const ordered = [...trades].sort(byExit);
  const out = [];
  let acc = 0;
  for (let i = 0; i < ordered.length; i++) {
    acc += ordered[i].r;
    if (i >= window) acc -= ordered[i - window].r;
    if (i >= window - 1) out.push({ time: ordered[i].exitTime ?? ordered[i].entryTime, expectancy: acc / window });
  }
  return out;
}

/** R results in fixed-width bins (for the distribution chart). */
export function histogram(trades, binWidth = 0.5) {
  const bins = new Map();
  for (const t of trades) {
    const k = Math.floor(t.r / binWidth);
    bins.set(k, (bins.get(k) ?? 0) + 1);
  }
  return [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([k, count]) => ({ from: k * binWidth, to: (k + 1) * binWidth, count }));
}

// --- dimensions: every way a trade can be sliced ------------------------------------

const nyHourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit' });
const nyHour = (engineTime) => Number(nyHourFormatter.formatToParts(new Date(engineTime + 5 * HOUR)).find((p) => p.type === 'hour').value);
const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/**
 * Some dimensions need the whole list (a stop-size tercile, "after a win",
 * "2nd trade of the day"), so a dimension is prepared once per list.
 * @returns {Record<string, {label:string, order:Array<string|number>|null, key:(t:object)=>string|number}>}
 */
export function buildDimensions(trades) {
  const ordered = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  const prev = new Map();
  const rank = new Map();
  let lastDay = null;
  let count = 0;
  ordered.forEach((t, i) => {
    prev.set(t, i === 0 ? 'Premier trade' : ordered[i - 1].r > 0 ? 'Après un gain' : ordered[i - 1].r < 0 ? 'Après une perte' : 'Après un trade nul');
    const day = Math.floor((t.entryTime + 5 * HOUR) / DAY); // the New York calendar day (DST moves the boundary by an hour at most)
    count = day === lastDay ? count + 1 : 1;
    lastDay = day;
    rank.set(t, count === 1 ? '1er trade du jour' : count === 2 ? '2e trade du jour' : '3e trade du jour ou plus');
  });
  const stopPct = trades.filter((t) => t.entryPrice > 0 && t.distance > 0).map((t) => t.distance / t.entryPrice).sort((a, b) => a - b);
  const q1 = stopPct[Math.max(0, Math.ceil(stopPct.length / 3) - 1)]; // upper edge of the lowest third
  const q2 = stopPct[Math.max(0, Math.ceil((2 * stopPct.length) / 3) - 1)];
  const stopBucket = (t) => {
    if (!(t.entryPrice > 0) || !(t.distance > 0)) return 'Inconnu';
    const p = t.distance / t.entryPrice;
    return p <= q1 ? 'Stop serré' : p <= q2 ? 'Stop moyen' : 'Stop large';
  };
  return {
    year: { label: 'Année', order: null, key: (t) => new Date(t.entryTime).getUTCFullYear() },
    quarter: { label: 'Trimestre', order: ['T1', 'T2', 'T3', 'T4'], key: (t) => `T${Math.floor(new Date(t.entryTime).getUTCMonth() / 3) + 1}` },
    month: { label: 'Mois de l\'année', order: MONTHS, key: (t) => MONTHS[new Date(t.entryTime).getUTCMonth()] },
    weekday: { label: 'Jour de la semaine', order: WEEKDAYS.slice(1, 6).concat(['Samedi', 'Dimanche']), key: (t) => WEEKDAYS[new Date(t.entryTime).getUTCDay()] },
    hour: { label: 'Heure d\'entrée (New York)', order: null, key: (t) => `${String(nyHour(t.entryTime)).padStart(2, '0')}h` },
    direction: { label: 'Sens', order: ['Achat', 'Vente'], key: (t) => (t.direction === 'bullish' ? 'Achat' : 'Vente') },
    outcome: { label: 'Issue', order: ['Objectif atteint', 'Stop touché', 'Sortie par délai'], key: (t) => (t.outcome === 'win' ? 'Objectif atteint' : t.outcome === 'loss' ? 'Stop touché' : 'Sortie par délai') },
    hold: {
      label: 'Durée du trade', order: ['Moins d\'1 h', '1 à 4 h', '4 à 12 h', '12 à 24 h', 'Plus de 24 h'],
      key: (t) => { const h = ((t.holdCandles ?? 0) * M15) / HOUR; return h < 1 ? 'Moins d\'1 h' : h < 4 ? '1 à 4 h' : h < 12 ? '4 à 12 h' : h < 24 ? '12 à 24 h' : 'Plus de 24 h'; },
    },
    stop: { label: 'Taille du stop', order: ['Stop serré', 'Stop moyen', 'Stop large'], key: stopBucket },
    previous: { label: 'Trade précédent', order: ['Premier trade', 'Après un gain', 'Après une perte', 'Après un trade nul'], key: (t) => prev.get(t) },
    rank: { label: 'Rang dans la journée', order: ['1er trade du jour', '2e trade du jour', '3e trade du jour ou plus'], key: (t) => rank.get(t) },
  };
}

function orderKeys(keys, order) {
  const present = [...new Set(keys)];
  if (order) return order.filter((k) => present.includes(k)).concat(present.filter((k) => !order.includes(k)));
  return present.sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
}

function cell(trades) {
  const rs = trades.map((t) => t.r);
  const n = rs.length;
  const totalR = sum(rs);
  const exp = expectancyStats(rs);
  return { n, winRate: n ? rs.filter((r) => r > 0).length / n : null, expectancy: n ? totalR / n : null, totalR, ci95: exp.ci95, significant: exp.significant };
}

/** One dimension: a row per value, with the trade count, hit rate, average R, total R and interval. */
export function groupStats(trades, dim) {
  const buckets = new Map();
  for (const t of trades) {
    const k = dim.key(t);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(t);
  }
  return orderKeys([...buckets.keys()], dim.order).map((k) => ({ key: k, ...cell(buckets.get(k)) }));
}

/** Two dimensions crossed. cells[rowKey][colKey] = { n, winRate, expectancy, totalR, ci95, significant } (absent when empty). */
export function crossTab(trades, dimRow, dimCol) {
  const buckets = new Map();
  for (const t of trades) {
    const r = dimRow.key(t);
    const c = dimCol.key(t);
    const key = `${r}|||${c}`;
    if (!buckets.has(key)) buckets.set(key, { r, c, list: [] });
    buckets.get(key).list.push(t);
  }
  const rows = orderKeys([...buckets.values()].map((b) => b.r), dimRow.order);
  const cols = orderKeys([...buckets.values()].map((b) => b.c), dimCol.order);
  const cells = {};
  for (const b of buckets.values()) (cells[b.r] ||= {})[b.c] = cell(b.list);
  return { rows, cols, cells };
}

/** Total R per calendar month: { years: [{year, months:[12 x number|null], total}] }. */
export function monthlyTable(trades) {
  const byYear = new Map();
  for (const t of trades) {
    const d = new Date(t.exitTime ?? t.entryTime);
    const y = d.getUTCFullYear();
    if (!byYear.has(y)) byYear.set(y, Array(12).fill(null));
    const row = byYear.get(y);
    const m = d.getUTCMonth();
    row[m] = (row[m] ?? 0) + t.r;
  }
  return { years: [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, months]) => ({ year, months, total: sum(months.map((v) => v ?? 0)) })) };
}

/** Splits at a cutoff (engine time): before = training, from it on = test. */
export function splitAt(trades, cutoff) {
  return { train: trades.filter((t) => t.entryTime < cutoff), test: trades.filter((t) => t.entryTime >= cutoff) };
}
