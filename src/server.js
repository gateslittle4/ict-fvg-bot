import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, MIN_RISK_PCT, MAX_RISK_PCT } from './config.js';
import { getDefaultAccount, getAccount, listAccounts } from './accountRegistry.js';
import { MAX_AUTO_EXECUTE_HOURS } from './accountRuntime.js';
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
import { DEFAULT_SPREADS } from './backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from './backtest/nySession.js';
import { getPropFirmProgram } from './propFirms/index.js';

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

// LiveStrategyEngine runs on candle timestamps shifted -5h (see
// cTraderDataSource.js's _toEngineCandle()/nySession.js's
// FIXED_EST_TO_UTC_OFFSET_MS) so its NY-session-window checks match the
// backtest's fixed-EST-as-UTC HistData convention. That shift is correct
// and required INSIDE the engine, but must never reach the dashboard - a
// signal validated at real NY session open would otherwise display 5h
// early. This is the one place engine-timestamped fields (entryTime on an
// open position, validatedAt on a signal) cross into an API response -
// shift them back to real wall-clock time here, not in the engine itself.
function toRealTime(ms) {
  return typeof ms === 'number' ? ms + FIXED_EST_TO_UTC_OFFSET_MS : ms;
}
function withRealTimePosition(position) {
  return position ? { ...position, entryTime: toRealTime(position.entryTime) } : null;
}
function withRealTimeSignal(signal) {
  return { ...signal, validatedAt: toRealTime(signal.validatedAt) };
}

// Deliberately the cheapest possible endpoint: no broker round-trip, no
// engine work, no allocation of anything meaningful. It exists so the
// keep-alive ping (see keepAlive.js) costs the running bot nothing, and so
// "is the process actually up?" can be answered without loading the whole
// dashboard. Process-level, not account-specific - see GET /api/accounts for
// a per-account breakdown.
app.get('/healthz', (req, res) => {
  const accounts = listAccounts();
  res.json({
    ok: true,
    uptimeSec: Math.round((Date.now() - BOOTED_AT) / 1000),
    accountsConnected: accounts.filter((a) => a.liveDataSource !== null).length,
    accountsTotal: accounts.length,
  });
});

// Multi-account overview (2026-09, multi-account rollout - see HANDOFF.md
// "Multi-compte"): one row per account this process manages, for the
// dashboard's "vue d'ensemble" - the detail behind each row lives at
// GET /api/accounts/:accountId/status (and friends, see below).
app.get('/api/accounts', (req, res) => {
  res.json({
    accounts: listAccounts().map((a) => {
      // firm/programLabel (2026-09, Esdras: "je croyais qu'il y allait avoir
      // un onglet pour FTMO" - dashboard groups accounts by prop firm) -
      // resolved server-side from propFirmProgramId so the client never
      // needs its own copy of PROP_FIRM_PROGRAMS. null firm (no program set,
      // e.g. today's default/demo account) groups under "Autres" client-side.
      const program = a.propFirmProgramId ? getPropFirmProgram(a.propFirmProgramId) : null;
      return {
        id: a.id,
        label: a.label,
        mode: a.mode,
        accountMode: a.accountMode,
        platform: a.platform,
        propFirmProgramId: a.propFirmProgramId,
        phaseIndex: a.phaseIndex,
        firm: program?.firm ?? null,
        programLabel: program?.label ?? null,
        balance: a.balance,
        broker: a.broker,
        guardrail: a.guardrail.getStatus(),
      };
    }),
  });
});

// Shared by GET .../status (polled fallback / first paint) and the SSE
// stream below (pushed) - one source of truth for the payload shape so the
// two paths can never silently drift apart. Takes the resolved AccountRuntime
// explicitly (2026-09, multi-account rollout) rather than closing over a
// single module-level store, since this is now shared by both the legacy
// /api/* routes (always the default account) and /api/accounts/:id/* (any
// account) - see createAccountRouter() below.
function buildStatusPayload(store) {
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
      openPosition: withRealTimePosition(store.strategyEngine.getOpenPosition(symbol)),
    };
  });

  return {
    accountId: store.id,
    accountLabel: store.label,
    mode: store.mode,
    // 'challenge' | 'live' account-type (Esdras, 2026-09: separate risk
    // sizing per mode/prop-firm program - see config.js's ACCOUNT_MODE
    // comment and src/propFirms/index.js). NOT the same thing as `mode`
    // above (that's the demo/live DATA connection status).
    accountMode: store.accountMode,
    propFirmProgramId: store.propFirmProgramId,
    phaseIndex: store.phaseIndex,
    timeframe: CONFIG.timeframe,
    balance: store.balance,
    guardrail: guardrailStatus,
    // Live value (2026-09, page réglages), not the boot-time CONFIG default -
    // store.strategyEngine.riskPctPerTrade is what store.setRiskPctPerTrade()
    // actually mutates, and the two can differ once someone's changed it
    // from the dashboard without restarting.
    riskPctPerTrade: store.strategyEngine.riskPctPerTrade,
    symbols,
    liveConfigured: store.platform !== 'mock',
    autoExecute: { ...store.autoExecute, active: store.isAutoExecuteActive() },
    broker: store.broker,
  };
}

// Shared by GET .../signals and the SSE stream below - same reasoning as
// buildStatusPayload() above.
function buildSignalsPayload(store) {
  const watching = store.signalLog
    .filter((e) => e.type === 'watching')
    .slice(-30)
    .reverse()
    .map(withRealTimeSignal);
  return {
    actionable: store.getActionableSignals().map(withRealTimeSignal),
    watching,
  };
}

const CHART_BUCKET_MS = {
  M15: 15 * 60 * 1000,
  H1: 60 * 60 * 1000,
  H4: 4 * 60 * 60 * 1000,
  D1: 24 * 60 * 60 * 1000,
};

const OVERLAY_CACHE_MS = 5 * 60 * 1000;
const RECENT_PERFORMANCE_CACHE_MS = 15 * 60 * 1000;

/**
 * Every route that reads/writes ONE account's state, mounted twice below:
 * once at the legacy flat `/api/*` paths (always the default account, for
 * the current dashboard - unaffected by this rollout until it's updated),
 * and once at `/api/accounts/:accountId/*` (any account, resolved by the
 * tiny middleware right before that mount). `getStore(req)` is the only
 * difference between the two mounts - every handler body is identical.
 *
 * Per-account caches (overlays, recent-performance) are keyed by account id
 * so two accounts' candle histories/reports can never leak into each other's
 * response, even though this router is a single shared instance.
 */
function createAccountRouter(getStore) {
  const router = express.Router();
  const overlayCache = new Map(); // `${accountId}:${symbol}` -> { builtAt, payload }
  const recentPerformanceCache = new Map(); // accountId -> { builtAt, report }
  const recentPerformanceInFlight = new Map(); // accountId -> Promise - at most ONE computation at a time per account

  router.get('/status', (req, res) => {
    res.json(buildStatusPayload(getStore(req)));
  });

  // "Mode indisponible" - see the comment on AccountRuntime.autoExecute. POST
  // { enabled: true, hours: 24 } to switch the bot to auto-executing entries
  // itself for that many hours (capped server-side), or { enabled: false } to
  // switch back to semi-automatic (alert-only) immediately.
  router.post('/auto-execute', (req, res) => {
    const store = getStore(req);
    try {
      const { enabled, hours } = req.body || {};
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: '`enabled` (boolean) is required' });
      }
      const result = store.setAutoExecute(enabled, hours);
      res.json({ ...result, active: store.isAutoExecuteActive() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // "Page réglages" (2026-09, at the user's request) - changes the LIVE risk %
  // per trade immediately (next signal onward). Does NOT persist across a
  // restart on its own - see config.js's RISK_PCT_PER_TRADE comment. The
  // symbol list is deliberately NOT editable from here (see the settings
  // card's own explanation in index.html): it's wired into warm-up/live
  // subscriptions at boot (cTraderDataSource.js) and netting/history keys
  // (LiveStrategyEngine's constructor), none of which safely re-run without a
  // restart - changing it live risks orphaning an open position's tracking.
  router.post('/settings/risk', (req, res) => {
    const store = getStore(req);
    try {
      const { riskPctPerTrade } = req.body || {};
      store.setRiskPctPerTrade(riskPctPerTrade);
      res.json({ riskPctPerTrade: store.strategyEngine.riskPctPerTrade, min: MIN_RISK_PCT, max: MAX_RISK_PCT });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/signals', (req, res) => {
    res.json(buildSignalsPayload(getStore(req)));
  });

  // SSE push stream (2026-09, "vrai temps réel" - the dashboard used to poll
  // .../status + .../signals every 3s; this pushes the same two payloads to
  // every connected client once a second instead, so the ticker/signals feel
  // instant rather than catching up on the next poll tick). A fixed 1s
  // server-side interval rather than wiring an emit() call into every mutation
  // site in cTraderDataSource.js/matchTraderDataSource.js/liveStrategyEngine.js
  // (spot ticks, execution events, warm-up, guardrail updates, auto-execute
  // toggles, ...) - far fewer places to get wrong, and the payload is small
  // (a handful of numbers) so pushing it every second is cheap even against
  // Render's free-tier CPU. GET, not a dedicated event name, so a plain
  // EventSource('/api/stream') with its default 'message' handler just works.
  router.get('/stream', (req, res) => {
    const store = getStore(req);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Disable any intermediary buffering (nginx-style proxies) that would
      // otherwise hold the first chunk back and defeat the whole point.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = () => {
      // A push mid-response-teardown (client just disconnected) would throw
      // into an unhandled context - res.writableEnded guards against that.
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ status: buildStatusPayload(store), signals: buildSignalsPayload(store) })}\n\n`);
    };
    send(); // first paint - don't make the client wait a full second for the initial frame
    const interval = setInterval(send, 1000);

    req.on('close', () => clearInterval(interval));
  });

  // Real broker account picture (equity estimate, real margin used, real open
  // positions, reconciliation vs what the bot BELIEVES is open) - see
  // accountReconciliation.js for exactly what's REAL vs ESTIMATED and why.
  router.get('/account', async (req, res) => {
    const store = getStore(req);
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
  router.get('/trade-history', async (req, res) => {
    const store = getStore(req);
    if (store.mode !== 'live' || typeof store.liveDataSource?.getTradeHistory !== 'function') {
      return res.json({ trades: [], reason: 'not connected to a live broker' });
    }
    // ?days=N (2026-09, dashboard filter) - getTradeHistory() itself already
    // clamps to 7 (ProtoOADealListReq's own hard cap on the from/to span, see
    // its own comment), this just parses+validates the query param before
    // passing it through. Any non-finite/non-positive value falls back to the
    // function's own default (7) rather than sending NaN/0 downstream.
    const requestedDays = Number(req.query.days);
    const days = Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : undefined;
    try {
      const trades = await store.liveDataSource.getTradeHistory({ days });
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
  router.get('/candles', (req, res) => {
    const store = getStore(req);
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
  router.get('/overlays', (req, res) => {
    const store = getStore(req);
    const symbol = req.query.symbol;
    if (!CONFIG.symbols.includes(symbol)) {
      return res.status(400).json({ error: `Unknown symbol "${symbol}". Known: ${CONFIG.symbols.join(', ')}` });
    }

    const cacheKey = `${store.id}:${symbol}`;
    const cached = overlayCache.get(cacheKey);
    if (cached && Date.now() - cached.builtAt < OVERLAY_CACHE_MS) {
      return res.json({ ...cached.payload, cachedAt: cached.builtAt });
    }

    const historyBySymbol = {};
    for (const s of CONFIG.symbols) historyBySymbol[s] = store.strategyEngine.getHistory(s);
    if (Object.values(historyBySymbol).every((h) => h.length === 0)) {
      return res.json({ symbol, zones: [], signals: [], reason: 'no candle history yet (still warming up or in demo mode)' });
    }

    try {
      // Same time-convention correction as .../candles - overlays have to land
      // on the same axis as the candles they annotate.
      const timeOffsetMs = store.liveDataSource?.candleTimeOffsetMs ?? 0;
      const { zones, signals } = buildChartOverlays(historyBySymbol, { symbol, timeOffsetMs });
      const payload = { symbol, zones, signals };
      overlayCache.set(cacheKey, { builtAt: Date.now(), payload });
      res.json({ ...payload, cachedAt: Date.now() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // "What would the bot have done over the last 90 days?" - at the user's
  // request, after realizing the warm-up replay already computes this and
  // throws it away. Cached rather than recomputed on every dashboard poll -
  // candles only update every 15 minutes anyway, so a 15-minute-old report is
  // never actually stale.
  //
  // The in-flight guard below is NOT belt-and-braces - it is the second half
  // of a real production outage fix (2026-09-09, see HANDOFF.md and
  // recentPerformanceReport.js's own comment). The cache is only written once
  // a report FINISHES, so while one was still computing, every subsequent
  // 120s dashboard poll started ANOTHER concurrent run. With the report's old
  // O(n^2) cost that stacked until the free tier's 0.15 CPU was pegged
  // permanently and the whole service stopped answering. The O(n^2) -> O(n)
  // fix makes each run cheap; this guard makes the stacking structurally
  // impossible regardless of how expensive a future report becomes - now
  // keyed per account id so one account's in-flight report never blocks or
  // gets confused with another's.
  router.get('/recent-performance', async (req, res) => {
    const store = getStore(req);
    const cached = recentPerformanceCache.get(store.id);
    if (cached && Date.now() - cached.builtAt < RECENT_PERFORMANCE_CACHE_MS) {
      return res.json({ ...cached.report, cachedAt: cached.builtAt });
    }
    const historyBySymbol = {};
    for (const symbol of CONFIG.symbols) {
      historyBySymbol[symbol] = store.strategyEngine.getHistory(symbol);
    }
    if (Object.values(historyBySymbol).every((h) => h.length === 0)) {
      return res.json({ trades: [], summary: null, reason: 'no candle history yet (still warming up or in demo mode)' });
    }
    try {
      if (!recentPerformanceInFlight.has(store.id)) {
        recentPerformanceInFlight.set(
          store.id,
          (async () => {
            try {
              const report = await buildRecentPerformanceReport(historyBySymbol, { days: 90 });
              recentPerformanceCache.set(store.id, { builtAt: Date.now(), report });
              return report;
            } finally {
              recentPerformanceInFlight.delete(store.id);
            }
          })()
        );
      }
      const report = await recentPerformanceInFlight.get(store.id);
      res.json({ ...report, cachedAt: recentPerformanceCache.get(store.id)?.builtAt ?? Date.now() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Forward-test validation: split historical candles at a cutoff date,
  // replay the strategy before and after, compare performance. Query:
  // ?cutoff=2026-06-30 (ISO date) or ?cutoff=1719705600000 (milliseconds).
  // This answers: "Does the strategy perform consistently on unseen data?"
  router.get('/forward-test', async (req, res) => {
    const store = getStore(req);
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
  // "je perds beaucoup en US500, est-ce normal?" - unlike .../recent-performance
  // above (a 90-day in-memory REPLAY that resets on every restart), this reads
  // real outcomes actually logged since persistence was turned on (see
  // supabaseTradeLog.js and cTraderDataSource.js's _logTradeOutcomes()) -
  // grows over calendar time, survives Render sleeping/redeploying. Returns
  // an explicit `reason` (not an error) when SUPABASE_URL/SUPABASE_SERVICE_KEY
  // aren't set - persistence is opt-in, same as keepAlive.js.
  router.get('/trade-log', async (req, res) => {
    const store = getStore(req);
    const client = store.liveDataSource?.tradeLogClient ?? null;
    const days = req.query.days ? Number(req.query.days) : null;
    try {
      const result = await fetchPerformanceBySymbol(client, { days });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ground-truth log of what actually happened to every order this process
  // submitted (2026-09, at the user's explicit request - "il faut que
  // l'ordre passe vraiment" - after a believed-open position turned out to
  // have no confirmation either way behind it). In-memory only (last 200,
  // same MAX_LOG_LENGTH convention as .../signals - this is a fast recency
  // check for the dashboard, not a durable audit trail; use .../trade-log
  // for that once persistence is on), populated exclusively from real
  // ProtoOAExecutionEvent outcomes - see accountRuntime.js's recordOrderOutcome().
  router.get('/order-log', (req, res) => {
    const store = getStore(req);
    res.json({ orders: [...store.orderOutcomeLog].reverse().slice(0, 30) });
  });

  // Temporary research export (2026-09, ad-hoc: "peux-tu tester le bot sur les
  // 8 derniers mois"). Reuses the LIVE cTrader connection already running on
  // Render (see cTraderDataSource.js's getHistoricalCandles) to pull a wider
  // historical window than the 90-day warm-up keeps in memory, as CSV in the
  // SAME format backtestEngine.js's other data (data/backtest-input/*.csv)
  // already uses - so the exact same offline analysis scripts work on it
  // unchanged. Gated behind ADMIN_EXPORT_TOKEN (opt-in, same pattern as
  // keepAlive.js/supabaseTradeLog.js - unset means the endpoint is disabled
  // entirely, not "open with no token") so a cTrader-heavy request can't be
  // triggered by anyone who finds the URL.
  router.get('/admin/export-candles', async (req, res) => {
    const store = getStore(req);
    const configuredToken = process.env.ADMIN_EXPORT_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: 'not enabled' });
    }
    if (req.query.token !== configuredToken) {
      return res.status(403).json({ error: 'invalid or missing token' });
    }
    const symbol = req.query.symbol;
    if (!CONFIG.symbols.includes(symbol)) {
      return res.status(400).json({ error: `Unknown symbol "${symbol}". Known: ${CONFIG.symbols.join(', ')}` });
    }
    const days = Math.min(Number(req.query.days) || 245, 245); // cTrader's own single-request cap for the M15 bucket (~35 weeks)
    if (typeof store.liveDataSource?.getHistoricalCandles !== 'function') {
      return res.status(503).json({ error: 'not connected to a live broker' });
    }
    try {
      const candles = await store.liveDataSource.getHistoricalCandles({ symbol, days });
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="${symbol}.csv"`);
      const lines = ['time,open,high,low,close'];
      for (const c of candles) lines.push(`${c.time},${c.open},${c.high},${c.low},${c.close}`);
      res.send(lines.join('\n'));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Real-spread sanity check (2026-09, at the user's explicit request: "est-ce
  // que le spread est celui qu'on avait planifié?"). transactionCosts.js's
  // DEFAULT_SPREADS for US100/US500/XAUUSD are labelled "INDICATIVE, verify
  // against FundingPips cTrader spec" - NEVER actually confirmed (see
  // HANDOFF.md's pending checklist). Reports what's ACTUALLY been observed
  // from real bid/ask ticks (store.recentTicksBySymbol, populated by
  // cTraderDataSource.js's spot-event handler) since this process booted,
  // alongside the assumed value used in every backtest/net-cost calculation,
  // so the gap (if any) is visible rather than assumed away. Same
  // ADMIN_EXPORT_TOKEN gate as .../admin/export-candles - opt-in, disabled
  // entirely when unset.
  router.get('/admin/spread-check', (req, res) => {
    const store = getStore(req);
    const configuredToken = process.env.ADMIN_EXPORT_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: 'not enabled' });
    }
    if (req.query.token !== configuredToken) {
      return res.status(403).json({ error: 'invalid or missing token' });
    }

    const result = {};
    for (const symbol of CONFIG.symbols) {
      const ticks = store.recentTicksBySymbol.get(symbol) || [];
      const assumedSpread = DEFAULT_SPREADS[symbol] ?? null;
      if (ticks.length === 0) {
        result[symbol] = { sampleCount: 0, assumedSpread, reason: 'no ticks observed yet since this process booted - try again once the market is open and a bit of time has passed' };
        continue;
      }
      const spreads = ticks.map((t) => t.ask - t.bid);
      const sum = spreads.reduce((s, v) => s + v, 0);
      const avgSpread = sum / spreads.length;
      const minSpread = Math.min(...spreads);
      const maxSpread = Math.max(...spreads);
      result[symbol] = {
        sampleCount: ticks.length,
        firstSampleAt: new Date(ticks[0].time).toISOString(),
        lastSampleAt: new Date(ticks[ticks.length - 1].time).toISOString(),
        avgSpread: Math.round(avgSpread * 100000) / 100000,
        minSpread: Math.round(minSpread * 100000) / 100000,
        maxSpread: Math.round(maxSpread * 100000) / 100000,
        assumedSpread,
        assumedVsAvgRatio: assumedSpread ? Math.round((avgSpread / assumedSpread) * 100) / 100 : null,
      };
    }
    res.json(result);
  });

  router.post('/lot-calc', (req, res) => {
    const store = getStore(req);
    try {
      const { symbol, entryPrice, stopPrice, riskPct, balance } = req.body || {};
      const spec = getDefaultSpec(symbol);
      if (!spec) {
        return res.status(400).json({ error: `Unknown symbol "${symbol}". Known: ${CONFIG.symbols.join(', ')}` });
      }
      const result = calculateLotSize({
        balance: typeof balance === 'number' ? balance : store.balance,
        riskPct: typeof riskPct === 'number' ? riskPct : store.strategyEngine.riskPctPerTrade,
        entryPrice,
        stopPrice,
        symbolSpec: spec,
      });
      res.json({ ...result, symbol, specSource: spec.verified ? 'verified' : 'placeholder-verify-before-live-use' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

// Legacy flat paths (/api/status, /api/signals, ...) - always the default
// account, UNCHANGED behavior for the current dashboard (not yet updated to
// pick an account - see HANDOFF.md's Phase 3). New: /api/accounts/:accountId/*
// - same routes, any account, resolved below (404 on an unknown id).
app.use('/api', createAccountRouter(() => getDefaultAccount()));
app.use(
  '/api/accounts/:accountId',
  (req, res, next) => {
    const account = getAccount(req.params.accountId);
    if (!account) return res.status(404).json({ error: `Unknown account "${req.params.accountId}"` });
    req.resolvedAccount = account;
    next();
  },
  createAccountRouter((req) => req.resolvedAccount)
);

const PORT = process.env.PORT || 3000;

// AUTO_EXECUTE_ALWAYS_ON (2026-09, opt-in, off by default): re-arms
// "mode indisponible" (AccountRuntime.autoExecute) for a fresh
// MAX_AUTO_EXECUTE_HOURS window at every single boot, right after a live
// broker connection succeeds - applied to EVERY account uniformly (one
// process-wide toggle, not per-account - see HANDOFF.md). Explicit user
// request ("passive income", won't be there to click Buy/Sell OR to
// re-click a time-boxed toggle): without this, the dashboard's manual
// toggle is capped at 7 days AND lives only in in-memory AccountRuntime
// state, so it silently reverts to semi-automatic the next time this
// process restarts - which on Render's free tier happens often (idle
// sleep/wake, deploys), likely well inside any 7-day window. Re-arming at
// every boot sidesteps that: the window never actually gets close to
// expiring as long as the process keeps restarting within 7 days of its
// last boot, which it reliably does. The dashboard toggle still works to
// pause it by hand in between boots - that pause just doesn't survive the
// NEXT restart, by design (this env var is the durable default, not a
// one-time nudge).
export function armAutoExecuteIfConfigured(account) {
  if (process.env.AUTO_EXECUTE_ALWAYS_ON !== 'true') return;
  const result = account.setAutoExecute(true, MAX_AUTO_EXECUTE_HOURS);
  console.log(`[boot:${account.id}] AUTO_EXECUTE_ALWAYS_ON=true - mode indisponible armed until ${new Date(result.expiresAt).toISOString()}`);
}

/**
 * Connects (or falls back to demo mode for) ONE account, per its own
 * CONFIG.accounts entry (2026-09, multi-account rollout - see
 * accountRegistry.js). Mirrors the pre-rollout single-account boot logic
 * exactly, just parameterized - see HANDOFF.md "Multi-compte".
 */
async function bootAccount(accountConfig) {
  const account = getAccount(accountConfig.id);
  if (!account) {
    console.error(`[boot] no AccountRuntime registered for "${accountConfig.id}" - skipping`);
    return;
  }
  if (accountConfig.platform === 'matchtrader') {
    try {
      const live = new MatchTraderDataSource({ account, brokerConfig: accountConfig.broker.matchTrader, symbols: CONFIG.symbols });
      await live.start();
      account.liveDataSource = live;
      console.log(`[boot:${account.id}] connected live to Match-Trader.`);
      armAutoExecuteIfConfigured(account);
    } catch (err) {
      console.error(`[boot:${account.id}] live Match-Trader connection failed, falling back to demo mode:`, err.message);
      startMockDataSource(account);
    }
  } else if (accountConfig.platform === 'ctrader') {
    try {
      const live = new CTraderDataSource({ account, brokerConfig: accountConfig.broker, symbols: CONFIG.symbols });
      await live.start();
      account.liveDataSource = live;
      console.log(`[boot:${account.id}] connected live to cTrader.`);
      armAutoExecuteIfConfigured(account);
    } catch (err) {
      console.error(`[boot:${account.id}] live cTrader connection failed, falling back to demo mode:`, err.message);
      startMockDataSource(account);
    }
  } else {
    console.log(`[boot:${account.id}] no broker credentials configured — starting in demo mode.`);
    startMockDataSource(account);
  }
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`ICT-FVG assistant listening on :${PORT}`);
    // Must start BEFORE the (slower) broker connections below: on Render's
    // free tier the sleep timer is what silently kills this whole process,
    // so the sooner the anti-sleep ping is armed the better. No-op unless
    // KEEP_ALIVE=true - see keepAlive.js for the free-instance-hours
    // trade-off that makes it opt-in.
    startKeepAlive();
    // Sequential, not parallel: keeps boot logs readable per account and
    // avoids N simultaneous cold connections at once - a few extra seconds
    // total at the "quelques comptes" scale this is designed for.
    for (const accountConfig of CONFIG.accounts) {
      await bootAccount(accountConfig);
    }
  });
}

export default app;
