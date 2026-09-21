import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRecentPerformanceReport } from '../src/backtest/recentPerformanceReport.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

function loadCsv(path) {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
  return lines.map((line) => {
    const [time, open, high, low, close] = line.split(',');
    return { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  });
}

test('empty history for every symbol produces an empty, well-shaped report', async () => {
  const report = await buildRecentPerformanceReport({ US100: [], US500: [], XAUUSD: [] }, { days: 90 });
  assert.deepEqual(report.trades, []);
  assert.deepEqual(report.summary, {
    windowDays: 90,
    settlement: 'M15, stop d\'abord (pessimiste)',
    count: 0,
    wins: 0,
    losses: 0,
    timeouts: 0,
    winRatePct: null,
    totalR: 0,
    totalGrossR: 0,
  });
});

test('missing symbols in the input are treated as empty, not a crash', async () => {
  const report = await buildRecentPerformanceReport({}, { days: 90 });
  assert.equal(report.trades.length, 0);
});

test('against real historical data: every trade resolves to a valid outcome and the summary arithmetic is internally consistent', async () => {
  // 1800 candles (~19 days of M15) is enough to exercise real FVG/Divergence
  // detection without paying too much of the O(n^2) rebuild-and-replay cost
  // this engine has (see HANDOFF.md) - keep this small so the suite stays fast.
  const US100 = loadCsv('data/backtest-input/US100.csv').slice(0, 1800);
  const US500 = loadCsv('data/backtest-input/US500.csv').slice(0, 1800);
  const XAUUSD = loadCsv('data/backtest-input/XAUUSD.csv').slice(0, 1800);

  const report = await buildRecentPerformanceReport({ US100, US500, XAUUSD }, { days: 90 });

  for (const t of report.trades) {
    assert.ok(['win', 'loss', 'timeout'].includes(t.outcome));
    // 2026-09-21: the report mirrors ALL live mechanisms now (it used to run only FVG + Divergence).
    assert.ok(['fvg', 'divergence', 'nwog', 'judaswing', 'weeklysweep', 'breakerblock', 'silverbullet', 'cbdr'].includes(t.source), t.source);
    // 2026-09-19: exit can now legitimately equal entry - a stop/target hit
    // within the entry candle's OWN range is caught immediately instead of
    // waiting for a later candle (see LiveStrategyEngine._resolveOpenPosition's
    // fix) - it can never be BEFORE entry, so >= is the real invariant now.
    assert.ok(t.exitTime >= t.entryTime);
    // 2026-09-14 ("on fait tout de facon honnete"): rMultiple is now NET of
    // a real spread cost - grossRMultiple keeps the old idealized value
    // (exactly the configured RR on a win, exactly -1 on a loss) so these
    // checks target the number that's actually still guaranteed exact.
    if (t.outcome === 'win') assert.ok(t.grossRMultiple > 0);
    if (t.outcome === 'loss') assert.equal(t.grossRMultiple, -1);
    if (t.outcome === 'timeout') {
      assert.equal(t.grossRMultiple, null);
      assert.equal(t.rMultiple, null);
    }
    // Spread cost only ever makes the net number worse than or equal to
    // gross (a real cost is never negative) - true for every outcome,
    // decided or not.
    if (t.rMultiple !== null) assert.ok(t.rMultiple <= t.grossRMultiple + 1e-9);
  }

  const { summary } = report;
  assert.equal(summary.count, report.trades.length);
  assert.equal(summary.wins + summary.losses + summary.timeouts, summary.count);
  const expectedTotalR = Math.round(report.trades.reduce((s, t) => s + (t.rMultiple || 0), 0) * 100) / 100;
  assert.equal(summary.totalR, expectedTotalR);
  const expectedTotalGrossR = Math.round(report.trades.reduce((s, t) => s + (t.grossRMultiple || 0), 0) * 100) / 100;
  assert.equal(summary.totalGrossR, expectedTotalGrossR);
  assert.ok(summary.totalR <= summary.totalGrossR + 1e-9);
  if (summary.wins + summary.losses > 0) {
    assert.equal(summary.winRatePct, (summary.wins / (summary.wins + summary.losses)) * 100);
  } else {
    assert.equal(summary.winRatePct, null);
  }
});

// Regression guard for the 2026-09-09 production outage (see HANDOFF.md and
// recentPerformanceReport.js's own comment): this report used to call
// ingestCandle() once per candle - O(n^2), which pegged Render's 0.15 CPU
// indefinitely and took the whole service down. It was migrated to the
// single-pass warmUp({ onEvent }) path. The speedup only matters if the
// OUTPUT is unchanged, so this pins that explicitly rather than trusting it.
test('warmUp-based report is byte-identical to the old per-candle ingestCandle() replay it replaced', async () => {
  const N = 2000; // enough to produce real trades; small enough that the reference O(n^2) loop below still finishes fast
  const historyBySymbol = {
    US100: loadCsv('data/backtest-input/US100.csv').slice(0, N),
    US500: loadCsv('data/backtest-input/US500.csv').slice(0, N),
    XAUUSD: loadCsv('data/backtest-input/XAUUSD.csv').slice(0, N),
    // EURUSD included: it only has Judas Swing among the live mechanisms, which the report now mirrors (2026-09-21).
    EURUSD: loadCsv('data/backtest-input/EURUSD.csv').slice(0, N),
  };

  // Reference implementation: the exact loop this file used to run, plus
  // the SAME spread-cost step buildRecentPerformanceReport() itself now
  // applies (2026-09-14, "on fait tout de facon honnete") - both the
  // engine's spreads option (changes WHICH signals validate) and the
  // gross/net R split (changes what a win/loss is worth) have to match or
  // this comparison stops proving anything.
  const engine = new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    breakerBlockConfig: CONFIG.breakerBlock,
    silverBulletConfig: CONFIG.silverBullet,
    cbdrConfig: CONFIG.cbdr,
    guardrail: new GuardrailEngine(CONFIG.guardrails),
    spreads: DEFAULT_SPREADS,
  });
  const windowMs = 90 * 24 * 60 * 60 * 1000;
  const openById = new Map();
  const referenceTrades = [];
  for (const symbol of CONFIG.symbols) {
    const all = historyBySymbol[symbol] || []; // same defensive fallback as the real buildRecentPerformanceReport()
    if (all.length === 0) continue;
    const latestTime = all[all.length - 1].time;
    for (const candle of all.filter((c) => c.time >= latestTime - windowMs)) {
      for (const e of engine.ingestCandle(symbol, candle)) {
        if (e.type === 'validated' && !e.blockedReason) openById.set(e.id, e);
        if (e.type === 'closed') {
          const opened = openById.get(e.id);
          if (!opened) continue;
          openById.delete(e.id);
          const grossRMultiple = e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null;
          const spread = DEFAULT_SPREADS[symbol] || 0;
          const costR = grossRMultiple !== null && spread > 0 && opened.distance > 0 ? spread / opened.distance : 0;
          referenceTrades.push({
            symbol,
            source: opened.source,
            direction: opened.direction,
            entryPrice: opened.entryPrice,
            entryTime: opened.validatedAt,
            exitTime: e.exitTime,
            outcome: e.outcome,
            grossRMultiple,
            rMultiple: grossRMultiple !== null ? grossRMultiple - costR : null,
          });
        }
      }
    }
  }
  referenceTrades.sort((a, b) => b.exitTime - a.exitTime);

  const report = await buildRecentPerformanceReport(historyBySymbol, { days: 90 });
  assert.ok(referenceTrades.length > 0, 'fixture must produce at least one trade, or this comparison is vacuous');
  assert.deepEqual(report.trades, referenceTrades);
});

test('a position already open before the report window started is excluded rather than guessed', async () => {
  // Feed enough candles for the engine to plausibly open a position, wipe the
  // "opened" bookkeeping's visibility by asking for a window shorter than
  // any trade could realistically open+close within, and confirm nothing
  // fabricated leaks into the report (0 trades is an acceptable, honest
  // answer for too-short a window - not a crash or an invented entry).
  const US100 = loadCsv('data/backtest-input/US100.csv').slice(0, 2000);
  const report = await buildRecentPerformanceReport({ US100, US500: [], XAUUSD: [] }, { days: 0.001 });
  assert.equal(report.trades.length, 0);
});

// 2026-09-21: the site's "performance récente" used to replay only FVG + Divergence (-17.7 R over 90 days) while the live combo has eight mechanisms.
test('the report includes mechanisms other than FVG and Divergence (it mirrors the live engine)', async () => {
  const historyBySymbol = {
    US100: loadCsv('data/backtest-input/US100.csv').slice(0, 6000),
    US500: loadCsv('data/backtest-input/US500.csv').slice(0, 6000),
    EURUSD: loadCsv('data/backtest-input/EURUSD.csv').slice(0, 6000),
  };
  const report = await buildRecentPerformanceReport(historyBySymbol, { days: 365 });
  const sources = new Set(report.trades.map((t) => t.source));
  assert.ok([...sources].some((x) => !['fvg', 'divergence'].includes(x)), `only ${[...sources].join(',')}`);
});
