// labAnalytics.js
// Pure analyses built on the trades the Labo already produces (2026-09-18,
// Esdras: "1,2,3" of the ideas list). A backtest verdict answers "is there an
// edge?"; these answer the questions a trader actually has next:
//   - simulateChallenge: "would this pass a prop-firm challenge, and how often
//     would it blow up?" (Monte Carlo over the strategy's own trades)
//   - buildHeatmap:      "when (weekday x hour) does it win, and does that hold
//     out of sample?"
//   - analyzePortfolio:  "do these strategies diversify each other?"
//
// Times are ENGINE time (fixed UTC-5, see nySession.js): getUTC* on an engine
// timestamp reads the engine-time wall clock, exactly like every strategy does.

import { ImportError } from './m1Import.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_TRADES = 20;

const dayOf = (t) => Math.floor((t.exitTime ?? t.entryTime) / DAY_MS);

/** Small deterministic PRNG so a simulation is reproducible (and testable). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// --- 1. prop-firm challenge Monte Carlo -------------------------------------

const num = (v, name, { min, max, dflt }) => {
  if (v === undefined || v === null || v === '') {
    if (dflt === undefined) throw new ImportError(`${name} : valeur manquante.`);
    return dflt;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ImportError(`${name} : valeur invalide (attendu entre ${min} et ${max}).`);
  return n;
};

/** Validates/clamps what the browser sends; throws ImportError (-> HTTP 400). */
export function normalizeChallengeParams(raw = {}) {
  const type = raw.maxDrawdownType ?? 'static';
  if (type !== 'static' && type !== 'trailing-eod') throw new ImportError('Type de drawdown inconnu (static ou trailing-eod).');
  return {
    targetPct: num(raw.targetPct, 'Objectif de profit (%)', { min: 0.5, max: 100 }),
    dailyLossLimitPct: num(raw.dailyLossLimitPct, 'Perte max par jour (%)', { min: 0.1, max: 100 }),
    maxDrawdownPct: num(raw.maxDrawdownPct, 'Drawdown max (%)', { min: 0.5, max: 100 }),
    maxDrawdownType: type,
    riskPct: num(raw.riskPct, 'Risque par trade (%)', { min: 0.05, max: 10, dflt: 1 }),
    maxDays: Math.round(num(raw.maxDays, 'Durée max (jours de trading)', { min: 5, max: 1000, dflt: 250 })),
    minTradingDays: Math.round(num(raw.minTradingDays, 'Jours de trading minimum', { min: 0, max: 100, dflt: 0 })),
    runs: Math.round(num(raw.runs, 'Nombre de simulations', { min: 200, max: 20000, dflt: 4000 })),
    seed: Math.round(num(raw.seed, 'Graine', { min: 0, max: 2 ** 31, dflt: 1 })),
  };
}

/** Groups R multiples by trading day, keeping intra-day order. */
export function groupTradesByDay(trades) {
  const byDay = new Map();
  const sorted = [...trades].sort((a, b) => (a.exitTime ?? a.entryTime) - (b.exitTime ?? b.entryTime));
  for (const t of sorted) {
    if (!Number.isFinite(t.rMultiple)) continue;
    const d = dayOf(t);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(t.rMultiple);
  }
  return [...byDay.values()];
}

/**
 * Replays the strategy's own trading days, drawn at random WITH replacement
 * (a day bootstrap: a day's trades stay together, so the daily-loss rule sees
 * realistic clusters instead of an artificially smooth sequence), against a
 * prop firm's rules, `runs` times. Balance is in % of the starting balance and
 * risk is a fixed % of it per trade (non-compounding - how challenge rules are
 * stated). Only days on which the strategy traded are drawn, so "days" below
 * are trading days with at least one trade.
 *
 * Caveats the UI repeats: past trades resampled are not a forecast; costs are
 * the backtest's; equity is measured on closed trades (no floating loss, so a
 * real daily-loss breach can happen a little earlier than shown).
 */
export function simulateChallenge(trades, rawParams) {
  const p = normalizeChallengeParams(rawParams);
  const days = groupTradesByDay(trades);
  const tradeCount = days.reduce((n, d) => n + d.length, 0);
  if (tradeCount < MIN_TRADES) {
    return { insufficient: true, tradeCount, minTrades: MIN_TRADES, params: p };
  }
  const rand = mulberry32(p.seed);
  const counts = { pass: 0, failDaily: 0, failDrawdown: 0, timeout: 0 };
  const passDays = [];
  const worstDrawdowns = [];
  const endBalances = [];

  for (let run = 0; run < p.runs; run++) {
    let balance = 100;
    let peakEod = 100;
    let peakBalance = 100;
    let worstDd = 0;
    let outcome = null;
    let day = 0;
    while (outcome === null && day < p.maxDays) {
      day++;
      const dayStart = balance;
      const rs = days[Math.floor(rand() * days.length)];
      for (const r of rs) {
        balance += r * p.riskPct;
        if (balance > peakBalance) peakBalance = balance;
        worstDd = Math.max(worstDd, peakBalance - balance);
        const floor = p.maxDrawdownType === 'static' ? 100 - p.maxDrawdownPct : peakEod - p.maxDrawdownPct;
        if (dayStart - balance >= p.dailyLossLimitPct) { outcome = 'failDaily'; break; }
        if (balance <= floor) { outcome = 'failDrawdown'; break; }
        if (balance >= 100 + p.targetPct && day >= p.minTradingDays) { outcome = 'pass'; break; }
      }
      if (outcome === null && balance > peakEod) peakEod = balance;
    }
    if (outcome === null) outcome = 'timeout';
    counts[outcome]++;
    if (outcome === 'pass') passDays.push(day);
    worstDrawdowns.push(worstDd);
    endBalances.push(balance - 100);
  }

  passDays.sort((a, b) => a - b);
  worstDrawdowns.sort((a, b) => a - b);
  endBalances.sort((a, b) => a - b);
  const totalR = days.flat().reduce((s, r) => s + r, 0);
  return {
    insufficient: false,
    params: p,
    tradeCount,
    tradingDays: days.length,
    expectancyR: totalR / tradeCount,
    runs: p.runs,
    counts,
    passRate: counts.pass / p.runs,
    failRate: (counts.failDaily + counts.failDrawdown) / p.runs,
    daysToPass: { median: percentile(passDays, 50), p90: percentile(passDays, 90) },
    drawdownPct: { p50: percentile(worstDrawdowns, 50), p95: percentile(worstDrawdowns, 95), p99: percentile(worstDrawdowns, 99) },
    endBalancePct: { p5: percentile(endBalances, 5), p50: percentile(endBalances, 50), p95: percentile(endBalances, 95) },
  };
}

// --- 2. weekday x hour heatmap ----------------------------------------------

const MIN_CELL_TRADES = 10;

function bucketStats(trades) {
  const n = trades.length;
  const sumR = trades.reduce((s, t) => s + t.rMultiple, 0);
  return { n, sumR, expR: n ? sumR / n : null };
}

/**
 * Expectancy by entry weekday (Mon-Fri) x entry hour (engine time), on the
 * train and test halves separately. A cell only counts as "holds" when it has
 * enough trades on BOTH sides and a positive expectancy on BOTH - with ~120
 * cells some will look great by pure chance, so the caller also gets how many
 * cells were testable and how many passed, to compare against that chance.
 */
export function buildHeatmap(trainTrades, testTrades) {
  const grid = new Map(); // "weekday-hour" -> { train: [], test: [] }
  const add = (list, side) => {
    for (const t of list) {
      if (!Number.isFinite(t.rMultiple) || !Number.isFinite(t.entryTime)) continue;
      const d = new Date(t.entryTime);
      const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
      if (!grid.has(key)) grid.set(key, { weekday: d.getUTCDay(), hour: d.getUTCHours(), train: [], test: [] });
      grid.get(key)[side].push(t);
    }
  };
  add(trainTrades, 'train');
  add(testTrades, 'test');

  const cells = [];
  for (const g of grid.values()) {
    const tr = bucketStats(g.train);
    const te = bucketStats(g.test);
    const all = bucketStats([...g.train, ...g.test]);
    const testable = tr.n >= MIN_CELL_TRADES && te.n >= MIN_CELL_TRADES;
    cells.push({
      weekday: g.weekday, hour: g.hour, n: all.n, expR: all.expR, sumR: all.sumR,
      trainN: tr.n, trainExp: tr.expR, testN: te.n, testExp: te.expR,
      testable, holds: testable && tr.expR > 0 && te.expR > 0,
    });
  }
  cells.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);

  const marginal = (keyFn, keys) => keys.map((k) => {
    const inGroup = cells.filter((c) => keyFn(c) === k);
    const n = inGroup.reduce((s, c) => s + c.n, 0);
    const sumR = inGroup.reduce((s, c) => s + c.sumR, 0);
    return { key: k, n, expR: n ? sumR / n : null };
  });
  return {
    cells,
    byWeekday: marginal((c) => c.weekday, [1, 2, 3, 4, 5]),
    byHour: marginal((c) => c.hour, [...Array(24).keys()]),
    testableCells: cells.filter((c) => c.testable).length,
    holdingCells: cells.filter((c) => c.holds).length,
    minCellTrades: MIN_CELL_TRADES,
  };
}

// --- 3. strategy portfolio ---------------------------------------------------

function maxDrawdownR(orderedR) {
  let eq = 0, peak = 0, dd = 0;
  for (const r of orderedR) {
    eq += r;
    if (eq > peak) peak = eq;
    dd = Math.max(dd, peak - eq);
  }
  return dd;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 5) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

const byExit = (a, b) => (a.exitTime ?? a.entryTime) - (b.exitTime ?? b.entryTime);

function maxConcurrent(trades) {
  const events = [];
  for (const t of trades) {
    events.push([t.entryTime, 1]);
    events.push([t.exitTime ?? t.entryTime, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // closes before opens at the same instant
  let cur = 0, max = 0;
  for (const [, d] of events) { cur += d; if (cur > max) max = cur; }
  return max;
}

function downsample(points, limit = 400) {
  if (points.length <= limit) return points;
  const step = points.length / limit;
  const out = [];
  for (let i = 0; i < limit; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

/**
 * @param {Record<string, {label:string, train:Array, test:Array}>} byStrategy
 *   each strategy's trades on the train and test halves
 * Every trade risks the same 1R, so combining is just merging the trade lists.
 * Correlation is measured on daily R over the days where AT LEAST ONE of the
 * two traded (counting shared empty days would make every sparse pair look
 * correlated for doing nothing at the same time).
 */
export function analyzePortfolio(byStrategy) {
  const ids = Object.keys(byStrategy);
  const all = {};
  const daily = {};
  for (const id of ids) {
    all[id] = [...byStrategy[id].train, ...byStrategy[id].test].filter((t) => Number.isFinite(t.rMultiple));
    const m = new Map();
    for (const t of all[id]) m.set(dayOf(t), (m.get(dayOf(t)) ?? 0) + t.rMultiple);
    daily[id] = m;
  }

  const strategies = ids.map((id) => {
    const ordered = [...all[id]].sort(byExit);
    const totalR = ordered.reduce((s, t) => s + t.rMultiple, 0);
    return { id, label: byStrategy[id].label, trades: ordered.length, totalR, expectancyR: ordered.length ? totalR / ordered.length : null, maxDrawdownR: maxDrawdownR(ordered.map((t) => t.rMultiple)) };
  });

  const correlation = ids.map((a) => ids.map((b) => {
    if (a === b) return 1;
    const days = new Set([...daily[a].keys(), ...daily[b].keys()]);
    const xs = [], ys = [];
    for (const d of days) { xs.push(daily[a].get(d) ?? 0); ys.push(daily[b].get(d) ?? 0); }
    return pearson(xs, ys);
  }));

  const merged = ids.flatMap((id) => all[id]).sort(byExit);
  const totalR = merged.reduce((s, t) => s + t.rMultiple, 0);
  let eq = 0;
  const equityCurve = merged.map((t) => ({ time: t.exitTime ?? t.entryTime, cumulativeR: (eq += t.rMultiple) }));
  const combined = {
    trades: merged.length, totalR, expectancyR: merged.length ? totalR / merged.length : null,
    maxDrawdownR: maxDrawdownR(merged.map((t) => t.rMultiple)),
    maxConcurrent: maxConcurrent(merged),
  };

  const half = (side) => {
    const list = ids.flatMap((id) => byStrategy[id][side]).filter((t) => Number.isFinite(t.rMultiple)).sort(byExit);
    const s = list.reduce((sum, t) => sum + t.rMultiple, 0);
    return { trades: list.length, totalR: s, expectancyR: list.length ? s / list.length : null, maxDrawdownR: maxDrawdownR(list.map((t) => t.rMultiple)) };
  };

  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (correlation[i][j] !== null) pairs.push(correlation[i][j]);
  const sumIndividualDd = strategies.reduce((s, x) => s + x.maxDrawdownR, 0);
  return {
    ids, strategies, correlation, combined,
    train: half('train'), test: half('test'),
    avgCorrelation: pairs.length ? pairs.reduce((s, v) => s + v, 0) / pairs.length : null,
    // How much smaller the combined drawdown is than the sum of the parts' (0 = no help, 1 = it vanishes).
    drawdownReduction: sumIndividualDd > 0 ? 1 - combined.maxDrawdownR / sumIndividualDd : null,
    equityCurve: downsample(equityCurve),
  };
}
