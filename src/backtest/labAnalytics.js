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

/**
 * How much a set of trade results (in R) can be trusted: the average with its
 * 95 % confidence interval, and how many trades it would take to know the average
 * is really above zero. Normal approximation on the mean (fine from ~30 trades;
 * below 10 no interval is given) - and trades are treated as independent, which
 * overlapping trades are not quite, so read the interval as slightly optimistic.
 * @param {Array<number|{rMultiple:number}>} results
 * @returns {{n:number, mean:number|null, sd:number|null, ci95:[number,number]|null, significant:boolean, tradesToConfirm:number|null, moreTradesNeeded:number|null}}
 */
export function expectancyStats(results) {
  const xs = results.map((t) => (typeof t === 'number' ? t : t?.rMultiple)).filter((x) => Number.isFinite(x));
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
  return runChallengeSimulation(groupTradesByDay(trades), p);
}

/** The Monte Carlo itself, on days already grouped as arrays of R. Shared by the single- and multi-strategy entry points. */
function runChallengeSimulation(days, p) {
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
    expectancy: expectancyStats(days.flat()),
    runs: p.runs,
    counts,
    passRate: counts.pass / p.runs,
    failRate: (counts.failDaily + counts.failDrawdown) / p.runs,
    daysToPass: { median: percentile(passDays, 50), p90: percentile(passDays, 90) },
    drawdownPct: { p50: percentile(worstDrawdowns, 50), p95: percentile(worstDrawdowns, 95), p99: percentile(worstDrawdowns, 99) },
    endBalancePct: { p5: percentile(endBalances, 5), p50: percentile(endBalances, 50), p95: percentile(endBalances, 95) },
  };
}

// --- 1b. several strategies through the bot's real guardrails ----------------

/** Same defaults as CONFIG.guardrails (config.js) - what the live bot enforces per account. */
export const DEFAULT_GUARDRAILS = { maxTradesPerDay: 3, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 2, oneOpenPerSymbol: true };

export function normalizeGuardrails(raw = {}) {
  return {
    maxTradesPerDay: Math.round(num(raw.maxTradesPerDay, 'Trades max par jour', { min: 1, max: 50, dflt: DEFAULT_GUARDRAILS.maxTradesPerDay })),
    cooldownMinutesAfterLoss: Math.round(num(raw.cooldownMinutesAfterLoss, 'Pause après une perte (minutes)', { min: 0, max: 1440, dflt: DEFAULT_GUARDRAILS.cooldownMinutesAfterLoss })),
    dailyLossLimitPct: num(raw.dailyLossLimitPct, 'Perte journalière du bot (%)', { min: 0.1, max: 100, dflt: DEFAULT_GUARDRAILS.dailyLossLimitPct }),
    oneOpenPerSymbol: raw.oneOpenPerSymbol !== false && raw.oneOpenPerSymbol !== 'false',
  };
}

/**
 * Replays one trading day through the SAME rules GuardrailEngine/LiveStrategyEngine
 * apply before a signal becomes a trade: at each entry, a trade is refused when
 *  - the day already has maxTradesPerDay CLOSED trades (open ones do not count -
 *    documented, accepted semantics of this project, see HANDOFF),
 *  - the last CLOSED trade was a loss and cooldownMinutesAfterLoss has not elapsed,
 *  - today's CLOSED loss has reached dailyLossLimitPct,
 *  - (oneOpenPerSymbol) another accepted trade on this symbol is still open
 *    (LiveStrategyEngine's "netting": one believed position per symbol).
 * All of it depends only on the day's own trades, so it is decided once per day,
 * not once per simulated run.
 * @param {Array<{entryTime:number, exitTime:number, r:number}>} dayTrades r = risk-weighted result in R
 * @returns {Array} accepted trades, ordered by exit time
 */
export function applyGuardrailsToDay(dayTrades, g, riskPct) {
  const byEntry = [...dayTrades].sort((a, b) => a.entryTime - b.entryTime);
  const kept = [];
  const cooldownMs = g.cooldownMinutesAfterLoss * 60000;
  for (const t of byEntry) {
    const closed = kept.filter((k) => k.exitTime <= t.entryTime);
    if (closed.length >= g.maxTradesPerDay) continue;
    if (g.oneOpenPerSymbol && kept.some((k) => k.exitTime > t.entryTime)) continue;
    const lastClosed = closed.reduce((best, k) => (!best || k.exitTime > best.exitTime ? k : best), null);
    if (lastClosed && lastClosed.r < 0 && t.entryTime < lastClosed.exitTime + cooldownMs) continue;
    const dayPnlPct = closed.reduce((sum, k) => sum + k.r * riskPct, 0);
    if (-dayPnlPct >= g.dailyLossLimitPct) continue;
    kept.push(t);
  }
  return kept.sort((a, b) => a.exitTime - b.exitTime);
}

/**
 * Prop-firm challenge Monte Carlo on SEVERAL strategies traded together on one
 * symbol, optionally filtered through the bot's guardrails first - so the answer
 * is what the bot would really do, not "every signal of every strategy gets taken".
 * @param {Record<string, {label?:string, trades:Array}>} byStrategy
 * @param {object} rawParams - challenge rules (normalizeChallengeParams)
 * @param {{guardrails?: object|null, weights?: Record<string, number>}} [opts]
 *   guardrails null/undefined = no filtering; weights = risk multiplier per strategy id (default 1)
 */
export function simulateMultiChallenge(byStrategy, rawParams, { guardrails = null, weights = {} } = {}) {
  const p = normalizeChallengeParams(rawParams);
  const g = guardrails ? normalizeGuardrails(guardrails) : null;
  const perDay = new Map();
  const offered = {};
  for (const [id, { trades }] of Object.entries(byStrategy)) {
    const w = Number.isFinite(weights[id]) && weights[id] >= 0 ? weights[id] : 1;
    offered[id] = 0;
    for (const t of trades) {
      if (!Number.isFinite(t.rMultiple) || !Number.isFinite(t.entryTime)) continue;
      const exitTime = t.exitTime ?? t.entryTime;
      const d = Math.floor(exitTime / DAY_MS);
      if (!perDay.has(d)) perDay.set(d, []);
      perDay.get(d).push({ id, entryTime: t.entryTime, exitTime, r: t.rMultiple * w });
      offered[id]++;
    }
  }
  const acceptedById = Object.fromEntries(Object.keys(byStrategy).map((id) => [id, 0]));
  const days = [];
  let totalOffered = 0;
  for (const dayTrades of perDay.values()) {
    totalOffered += dayTrades.length;
    const kept = g ? applyGuardrailsToDay(dayTrades, g, p.riskPct) : [...dayTrades].sort((a, b) => a.exitTime - b.exitTime);
    if (kept.length === 0) continue;
    for (const k of kept) acceptedById[k.id]++;
    days.push(kept.map((k) => k.r));
  }
  const totalAccepted = Object.values(acceptedById).reduce((a, b) => a + b, 0);
  return {
    ...runChallengeSimulation(days, p),
    guardrails: g,
    offeredTrades: totalOffered,
    acceptedTrades: totalAccepted,
    perStrategy: Object.keys(byStrategy).map((id) => ({ id, label: byStrategy[id].label ?? id, offered: offered[id], accepted: acceptedById[id], weight: Number.isFinite(weights[id]) ? weights[id] : 1 })),
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
    return { id, label: byStrategy[id].label, trades: ordered.length, totalR, expectancyR: ordered.length ? totalR / ordered.length : null, expectancy: expectancyStats(ordered), maxDrawdownR: maxDrawdownR(ordered.map((t) => t.rMultiple)) };
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
    expectancy: expectancyStats(merged),
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
