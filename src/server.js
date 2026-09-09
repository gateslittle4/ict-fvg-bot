import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, isLiveConfigured, getConfiguredPlatform } from './config.js';
import { store, getActionableSignals, setAutoExecute, isAutoExecuteActive } from './store.js';
import { calculateLotSize, getDefaultSpec } from './engines/lotCalculator.js';
import { startMockDataSource } from './dataSources/mockDataSource.js';
import { CTraderDataSource } from './dataSources/cTraderDataSource.js';
import { summarizeTrades } from './dataSources/dealPairing.js';
import { MatchTraderDataSource } from './dataSources/matchTraderDataSource.js';
import { buildRecentPerformanceReport } from './backtest/recentPerformanceReport.js';
import { buildForwardTest } from './backtest/forwardTest.js';
import { resampleCandles } from './backtest/htfBias.js';
import { buildChartOverlays } from './backtest/chartOverlays.js';
import { startKeepAlive } from './keepAlive.js';
import { fetchPerformanceBySymbol } from './dataSources/supabaseTradeLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
// Lightweight Charts (TradingView's own open-source charting library) is
// served from OUR origin rather than a CDN on purpose: the dashboard is
// already hard enough to reach on the user's network (see HANDOFF.md), and a
// CDN would add a second host that has to resolve and load before the chart
// can draw anything. Comes from the npm dependency, so it updates with
// `npm install` instead of being a copied-in vendored blob.
app.use('/vendor/lightweight-charts', express.static(path.join(__dirname, '..', 'node_modules', 'lightweight-charts', 'dist')));

const BOOTED_AT = Date.now();

// Deliberately the cheapest possible endpoint: no broker round-trip, no
// engine work, no allocation of anything meaningful. It exists so the
// keep-alive ping (see keepAlive.js) costs the running bot nothing, and so
// "is the process actually up?" can be answered without loading the whole
// dashboard.
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    mode: store.mode,
    uptimeSec: Math.round((Date.now() - BOOTED_AT) / 1000),
    brokerConnected: store.liveDataSource !== null,
  });
});

app.get('/api/status', (req, res) => {
  const guardrailStatus = store.guardrail.getStatus();
  const symbols = CONFIG.symbols.map((symbol) => {
    const last = store.lastCandleBySymbol.get(symbol);
    return {
      symbol,
      lastPrice: last ? last.close : null,
      lastCandleTime: last ? last.time : null,
      // open/high/low added 2026-09 for the market chart's live-tick update
      // (see chart.html) - lastCandleBySymbol is updated on EVERY spot tick
      // (cTraderDataSource.js's ProtoOASpotEvent handler), unlike
      // LiveStrategyEngine's own retained history, which only keeps the
      // FIRST tick of each bar (ingestCandle()'s own dedup guard rejects
      // later updates to an already-seen bar time - correct and untouched,
      // that history feeds signal detection, not display). Without this,
      // the chart's rightmost candle looked frozen between M15 closes even
      // though the real price was moving the whole time - "the price
      // doesn't move" was a real, reported observation, not a false one.
      lastOpen: last ? last.open : null,
      lastHigh: last ? last.high : null,
      lastLow: last ? last.low : null,
      openPosition: store.strategyEngine.getOpenPosition(symbol),
    };
  });

  res.json({
    mode: store.mode,
    timeframe: CONFIG.timeframe,
    balance: store.balance,
    guardrail: guardrailStatus,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    symbols,
    liveConfigured: isLiveConfigured(),
    autoExecute: { ...store.autoExecute, active: isAutoExecuteActive() },
    broker: store.broker,
  });
});

// "Mode indisponible" - see the comment on store.autoExecute. POST
// { enabled: true, hours: 24 } to switch the bot to auto-executing entries
// itself for that many hours (capped server-side), or { enabled: false } to
// switch back to semi-automatic (alert-only) immediately.
app.post('/api/auto-execute', (req, res) => {
  try {
    const { enabled, hours } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '`enabled` (boolean) is required' });
    }
    const result = setAutoExecute(enabled, hours);
    res.json({ ...result, active: isAutoExecuteActive() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/signals', (req, res) => {
  const watching = store.signalLog
    .filter((e) => e.type === 'watching')
    .slice(-30)
    .reverse();
  res.json({
    actionable: getActionableSignals(),
    watching,
  });
});

// Real broker account picture (equity estimate, real margin used, real open
// positions, reconciliation vs what the bot BELIEVES is open) - see
// accountReconciliation.js for exactly what's REAL vs ESTIMATED and why.
app.get('/api/account', async (req, res) => {
  if (store.mode !== 'live' || typeof store.liveDataSource?.getAccountReconciliation !== 'function') {
    return res.json({ reason: 'not connected to a live broker' });
  }
  try {
    const account = await store.liveDataSource.getAccountReconciliation();
    res.json(account);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Trading journal (2026-09, at the user's request): closed trades over the
// last few days with a small chart window, queried fresh from the broker on
// every request rather than stored - see getTradeHistory()'s own comment in
// cTraderDataSource.js for why (no database to keep in sync with restarts,
// but no historical stop-loss/take-profit either - not fabricated here).
app.get('/api/trade-history', async (req, res) => {
  if (store.mode !== 'live' || typeof store.liveDataSource?.getTradeHistory !== 'function') {
    return res.json({ trades: [], reason: 'not connected to a live broker' });
  }
  try {
    const trades = await store.liveDataSource.getTradeHistory();
    res.json({ trades, summary: summarizeTrades(trades) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Market chart (2026-09, at the user's request: "un graphe des marchés
// choisis"). Serves the bot's OWN already-retained candle history
// (LiveStrategyEngine.getHistory - the same 90-day window kept warm for
// signal detection) - no extra broker round-trip needed, works identically
// in live and demo mode.
const CHART_BUCKET_MS = {
  M15: 15 * 60 * 1000,
  H1: 60 * 60 * 1000,
  H4: 4 * 60 * 60 * 1000,
  D1: 24 * 60 * 60 * 1000,
};

app.get('/api/candles', (req, res) => {
  const symbol = req.query.symbol;
  if (!CONFIG.symbols.includes(symbol)) {
    return res.status(400).json({ error: `Unknown symbol "${symbol}". Known: ${CONFIG.symbols.join(', ')}` });
  }
  const timeframe = req.query.timeframe || 'M15';
  const bucketMs = CHART_BUCKET_MS[timeframe];
  if (!bucketMs) {
    return res.status(400).json({ error: `Unknown timeframe "${timeframe}". Known: ${Object.keys(CHART_BUCKET_MS).join(', ')}` });
  }
  const limit = Math.min(Number(req.query.limit) || 300, 5000);

  // The engine's retained candles are in whatever time convention the active
  // data source feeds it - for cTrader that is the backtest's
  // fixed-EST-as-UTC convention, i.e. 5h behind real UTC (see
  // CTraderDataSource's candleTimeOffsetMs). Undo it here so the chart plots
  // real wall-clock times instead of every bar sitting 5 hours early.
  const offsetMs = store.liveDataSource?.candleTimeOffsetMs ?? 0;
  const history = store.strategyEngine.getHistory(symbol);

  // Resample BEFORE slicing so a bucket is never built from a partial slice,
  // then take the last `limit` buckets. M15 is the native resolution, so it
  // needs no resampling at all.
  const buckets = timeframe === 'M15' ? history : resampleCandles(history, bucketMs);
  const candles = buckets.slice(-limit).map((c) => ({ ...c, time: c.time + offsetMs }));

  res.json({ symbol, timeframe, candles });
});

// The bot's own reasoning, drawn on the chart: the FVG zones it detected and
// the signals it fired. This is the one thing a broker's chart (MT4,
// Match-Trader) structurally cannot show, since it knows nothing about this
// strategy. Cheap enough to serve directly (~80ms for a 90-day window, see
// chartOverlays.js) but still cached briefly, because the dashboard polls
// and the underlying candles only change every 15 minutes anyway.
const OVERLAY_CACHE_MS = 5 * 60 * 1000;
const overlayCache = new Map(); // symbol -> { builtAt, payload }

app.get('/api/overlays', (req, res) => {
  const symbol = req.query.symbol;
  if (!CONFIG.symbols.includes(symbol)) {
    return res.status(400).json({ error: `Unknown symbol "${symbol}". Known: ${CONFIG.symbols.join(', ')}` });
  }

  const cached = overlayCache.get(symbol);
  if (cached && Date.now() - cached.builtAt < OVERLAY_CACHE_MS) {
    return res.json({ ...cached.payload, cachedAt: cached.builtAt });
  }

  const historyBySymbol = {};
  for (const s of CONFIG.symbols) historyBySymbol[s] = store.strategyEngine.getHistory(s);
  if (Object.values(historyBySymbol).every((h) => h.length === 0)) {
    return res.json({ symbol, zones: [], signals: [], reason: 'no candle history yet (still warming up or in demo mode)' });
  }

  try {
    // Same time-convention correction as /api/candles - overlays have to land
    // on the same axis as the candles they annotate.
    const timeOffsetMs = store.liveDataSource?.candleTimeOffsetMs ?? 0;
    const { zones, signals } = buildChartOverlays(historyBySymbol, { symbol, timeOffsetMs });
    const payload = { symbol, zones, signals };
    overlayCache.set(symbol, { builtAt: Date.now(), payload });
    res.json({ ...payload, cachedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "What would the bot have done over the last 90 days?" - at the user's
// request, after realizing the warm-up replay already computes this and
// throws it away. Expensive (same O(n^2) rebuild-and-replay as the live
// warm-up, see recentPerformanceReport.js), so cached rather than
// recomputed on every dashboard poll - candles only update every 15 minutes
// anyway, so a 15-minute-old report is never actually stale.
const RECENT_PERFORMANCE_CACHE_MS = 15 * 60 * 1000;
let recentPerformanceCache = null; // { builtAt, report }

app.get('/api/recent-performance', async (req, res) => {
  if (recentPerformanceCache && Date.now() - recentPerformanceCache.builtAt < RECENT_PERFORMANCE_CACHE_MS) {
    return res.json({ ...recentPerformanceCache.report, cachedAt: recentPerformanceCache.builtAt });
  }
  const historyBySymbol = {};
  for (const symbol of CONFIG.symbols) {
    historyBySymbol[symbol] = store.strategyEngine.getHistory(symbol);
  }
  if (Object.values(historyBySymbol).every((h) => h.length === 0)) {
    return res.json({ trades: [], summary: null, reason: 'no candle history yet (still warming up or in demo mode)' });
  }
  try {
    const report = await buildRecentPerformanceReport(historyBySymbol, { days: 90 });
    recentPerformanceCache = { builtAt: Date.now(), report };
    res.json({ ...report, cachedAt: recentPerformanceCache.builtAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forward-test validation: split historical candles at a cutoff date,
// replay the strategy before and after, compare performance. Query:
// ?cutoff=2026-06-30 (ISO date) or ?cutoff=1719705600000 (milliseconds).
// This answers: "Does the strategy perform consistently on unseen data?"
app.get('/api/forward-test', async (req, res) => {
  const cutoff = req.query.cutoff;
  if (!cutoff) {
    return res.status(400).json({ error: 'cutoff query parameter required (ISO date like 2026-06-30 or milliseconds)' });
  }

  let cutoffMs;
  if (/^\d+$/.test(cutoff)) {
    cutoffMs = Number(cutoff);
  } else {
    cutoffMs = new Date(cutoff).getTime();
  }

  if (Number.isNaN(cutoffMs)) {
    return res.status(400).json({ error: `Invalid cutoff date: "${cutoff}". Use ISO format (2026-06-30) or milliseconds.` });
  }

  const historyBySymbol = {};
  for (const symbol of CONFIG.symbols) {
    historyBySymbol[symbol] = store.strategyEngine.getHistory(symbol);
  }
  if (Object.values(historyBySymbol).every((h) => h.length === 0)) {
    return res.json({ reason: 'no candle history yet (still warming up or in demo mode)' });
  }

  try {
    const result = await buildForwardTest(historyBySymbol, { cutoffMs });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Durable per-symbol journal (2026-09, at the user's explicit request:
// "je perds beaucoup en US500, est-ce normal?" - unlike /api/recent-performance
// above (a 90-day in-memory REPLAY that resets on every restart), this reads
// real outcomes actually logged since persistence was turned on (see
// supabaseTradeLog.js and cTraderDataSource.js's _logTradeOutcomes()) -
// grows over calendar time, survives Render sleeping/redeploying. Returns
// an explicit `reason` (not an error) when SUPABASE_URL/SUPABASE_SERVICE_KEY
// aren't set - persistence is opt-in, same as keepAlive.js.
app.get('/api/trade-log', async (req, res) => {
  const client = store.liveDataSource?.tradeLogClient ?? null;
  const days = req.query.days ? Number(req.query.days) : null;
  try {
    const result = await fetchPerformanceBySymbol(client, { days });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lot-calc', (req, res) => {
  try {
    const { symbol, entryPrice, stopPrice, riskPct, balance } = req.body || {};
    const spec = getDefaultSpec(symbol);
    if (!spec) {
      return res.status(400).json({ error: `Unknown symbol "${symbol}". Known: ${CONFIG.symbols.join(', ')}` });
    }
    const result = calculateLotSize({
      balance: typeof balance === 'number' ? balance : store.balance,
      riskPct: typeof riskPct === 'number' ? riskPct : CONFIG.risk.riskPctPerTrade,
      entryPrice,
      stopPrice,
      symbolSpec: spec,
    });
    res.json({ ...result, symbol, specSource: spec.verified ? 'verified' : 'placeholder-verify-before-live-use' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`ICT-FVG assistant listening on :${PORT}`);
    // Must start BEFORE the (slower) broker connection below: on Render's
    // free tier the sleep timer is what silently kills this whole process,
    // so the sooner the anti-sleep ping is armed the better. No-op unless
    // KEEP_ALIVE=true - see keepAlive.js for the free-instance-hours
    // trade-off that makes it opt-in.
    startKeepAlive();
    const platform = getConfiguredPlatform();
    if (platform === 'matchtrader') {
      try {
        const live = new MatchTraderDataSource();
        await live.start();
        store.liveDataSource = live;
        console.log('[boot] connected live to Match-Trader.');
      } catch (err) {
        console.error('[boot] live Match-Trader connection failed, falling back to demo mode:', err.message);
        startMockDataSource();
      }
    } else if (platform === 'ctrader') {
      try {
        const live = new CTraderDataSource();
        await live.start();
        store.liveDataSource = live;
        console.log('[boot] connected live to cTrader.');
      } catch (err) {
        console.error('[boot] live cTrader connection failed, falling back to demo mode:', err.message);
        startMockDataSource();
      }
    } else {
      console.log('[boot] no broker credentials configured — starting in demo mode.');
      startMockDataSource();
    }
  });
}

export default app;
