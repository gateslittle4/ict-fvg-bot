import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, MIN_RISK_PCT, MAX_RISK_PCT, normalizeAccountEntry } from './config.js';
import { getDefaultAccount, getAccount, listAccounts, registerAccount } from './accountRegistry.js';
import { MAX_AUTO_EXECUTE_HOURS } from './accountRuntime.js';
import { calculateLotSize, getDefaultSpec } from './engines/lotCalculator.js';
import { startMockDataSource } from './dataSources/mockDataSource.js';
import { CTraderDataSource, sendCommandWithTimeout } from './dataSources/cTraderDataSource.js';
import { summarizeTrades } from './dataSources/dealPairing.js';
import { MatchTraderDataSource } from './dataSources/matchTraderDataSource.js';
import { buildRecentPerformanceReport } from './backtest/recentPerformanceReport.js';
import { buildForwardTest } from './backtest/forwardTest.js';
import { resampleCandles } from './backtest/htfBias.js';
import { buildChartOverlays } from './backtest/chartOverlays.js';
import { startKeepAlive } from './keepAlive.js';
import { fetchPerformanceBySymbol } from './dataSources/supabaseTradeLog.js';
import { fetchDynamicAccounts, saveDynamicAccount, listDynamicAccountsRedacted, deleteDynamicAccount } from './dataSources/supabaseAccountStore.js';
import { DEFAULT_SPREADS } from './backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from './backtest/nySession.js';
import { getPropFirmProgram } from './propFirms/index.js';
import { isChatConfigured, buildChatContext, answerChatQuestion, chatErrorStatus } from './chatAssistant.js';

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

// jsPDF/jsPDF-autotable (2026-09-15, Esdras: "rapport PDF exportable du
// journal") - same reasoning as lightweight-charts above: served from our
// own origin, from the npm dependency, not a CDN.
app.use('/vendor/jspdf', express.static(path.join(__dirname, '..', 'node_modules', 'jspdf', 'dist')));
app.use('/vendor/jspdf-autotable', express.static(path.join(__dirname, '..', 'node_modules', 'jspdf-autotable', 'dist')));

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
// 2026-09-13, at Esdras's explicit correction ("le trade n'est pas ouvert,
// dis plutôt un ordre en attente"): `position` here is ONLY
// LiveStrategyEngine's own optimistic belief, set the instant a signal
// validates (see _processFvgEvent etc. in liveStrategyEngine.js) - true for
// EVERY source (FVG/Divergence/NWOG/Judas Swing) whether or not an order
// was ever actually sent to the broker. It must never reach the dashboard
// unlabeled as if it were a confirmed fact. `confirmed` cross-checks it
// against orderOutcomeLog - the ONLY place a real ProtoOAExecutionEvent
// outcome is recorded (see accountRuntime.js/_handleExecutionEvent) -
// matched by the same signal id so a stale outcome from an older signal on
// this symbol can never be mistaken for this one's. true only once the
// broker itself has confirmed a real fill; false covers BOTH "still
// awaiting confirmation" and "no order was ever submitted" (auto-execute
// was off when this signal validated) - genuinely indistinguishable from
// this log alone, so deliberately not oversold as more specific than that.
function withRealTimePosition(symbol, position, orderOutcomeLog) {
  if (!position) return null;
  const confirmed = (orderOutcomeLog || []).some(
    (o) => o.symbol === symbol && o.signalId === position.id && o.outcome === 'filled'
  );
  return { ...position, entryTime: toRealTime(position.entryTime), confirmed };
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

// "Comptes" dashboard page backend (2026-09-13, see
// supabaseAccountStore.js's header - Esdras: "un moyen de mettre les codes
// dans le site à la main, sans redéployer"). Same ADMIN_EXPORT_TOKEN gate as
// every other admin route in this file. GET never returns raw secrets (see
// listDynamicAccountsRedacted) - only booleans for "is this credential set".
function requireAdminToken(req, res) {
  const configuredToken = process.env.ADMIN_EXPORT_TOKEN;
  if (!configuredToken) {
    res.status(404).json({ error: 'not enabled' });
    return false;
  }
  const provided = req.query.token || req.body?.token;
  if (provided !== configuredToken) {
    res.status(403).json({ error: 'invalid or missing token' });
    return false;
  }
  return true;
}

app.get('/api/admin/accounts', async (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const accounts = await listDynamicAccountsRedacted();
  res.json({ accounts });
});

app.post('/api/admin/accounts', async (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const { token, ...raw } = req.body || {};
  if (!raw.id) return res.status(400).json({ error: 'id is required' });
  const result = await saveDynamicAccount(raw);
  if (!result.ok) return res.status(502).json(result);
  res.json({ ok: true, note: 'Sauvegardé. Redémarre le bot (bouton ci-dessous) pour que ce compte se connecte.' });
});

app.delete('/api/admin/accounts/:id', async (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const result = await deleteDynamicAccount(req.params.id);
  if (!result.ok) return res.status(502).json(result);
  res.json({ ok: true, note: 'Supprimé de Supabase. Redémarre le bot pour que ça prenne effet (le compte reste actif jusque-là).' });
});

// Restart-only (NOT a redeploy - no rebuild, no git push, just this process
// exiting so Render's own restart policy brings it back up in ~10-20s,
// re-reading Supabase accounts + ACCOUNTS_JSON fresh on the new boot). This
// is what actually satisfies "sans redéployer" for a newly-saved account -
// saving to Supabase alone doesn't connect anything until the next boot,
// and this is the fast way to get one without touching the deployed code.
// Confirmed empirically this session: an uncaught crash earlier today was
// auto-restarted by Render within seconds with a clean reconnect - this
// uses that exact same recovery path, deliberately instead of accidentally.
app.post('/api/admin/restart', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  res.json({ ok: true, note: 'Redémarrage en cours - le bot sera de retour dans ~10-20 secondes.' });
  console.log('[admin] restart requested via /api/admin/restart');
  setTimeout(() => process.exit(0), 250); // let the response above actually flush first
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
      openPosition: withRealTimePosition(symbol, store.strategyEngine.getOpenPosition(symbol), store.orderOutcomeLog),
      // 2026-09-15: cooldown-after-loss is now scoped PER SYMBOL (see
      // guardrailEngine.js) - the top-level `guardrail` block below still
      // reports the account-wide fallback (no symbol) for backward
      // compatibility, which no longer reflects what actually gates a new
      // entry on any ONE symbol. This is the real per-symbol number.
      cooldownRemainingMs: store.guardrail.getStatus(Date.now(), symbol).cooldownRemainingMs,
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
 * Shared core of a real position close (2026-09-15) - factored out of
 * `/admin/close-position` so the dashboard's own "Fermer" button (see
 * `/positions/:positionId/close` below) can send the exact same
 * ProtoOAClosePositionReq + confirmation-wait logic, not a second
 * reimplementation. Returns `{closed: true, closePnl}` or throws - callers
 * decide their own response shape/status code around that.
 * @param {object} ds - store.liveDataSource (must have a live `.connection`)
 * @param {number} positionId
 * @param {number} volume - broker units (centilots), e.g. BTCUSD's 1 == 0.01 lot
 * @param {string} [logPrefix] - just for the console.error lines below
 */
async function closePositionOnBroker(ds, positionId, volume, logPrefix = 'close-position') {
  const accountId = Number(ds.accountId);
  const closeFillPromise = new Promise((resolve, reject) => {
    let uuid;
    const safeRemove = () => {
      try {
        if (uuid != null) ds.connection.removeEventListener(uuid);
      } catch (removeErr) {
        console.error(`[${logPrefix}] removeEventListener failed (non-fatal):`, removeErr);
      }
    };
    const timer = setTimeout(() => {
      safeRemove();
      reject(new Error('timed out after 15000ms waiting for the close to confirm'));
    }, 15000);
    uuid = ds.connection.on('ProtoOAExecutionEvent', (event) => {
      try {
        const d = event.descriptor;
        const pid = d.deal?.positionId ?? d.position?.positionId;
        // String(...) both sides - protobuf serializes this field as a
        // STRING, positionId here is a Number, so a bare !== can never
        // match (2026-09-13, real bug found live via /admin/close-position).
        if (String(pid) !== String(positionId)) return;
        if (['ORDER_REJECTED', 'ORDER_CANCELLED', 'ORDER_EXPIRED'].includes(d.executionType)) {
          clearTimeout(timer);
          safeRemove();
          reject(new Error(`close ${d.executionType.toLowerCase()} (errorCode=${d.errorCode ?? 'n/a'})`));
          return;
        }
        if (d.executionType === 'ORDER_FILLED' && d.deal?.closePositionDetail) {
          clearTimeout(timer);
          safeRemove();
          resolve(d);
        }
      } catch (predicateErr) {
        clearTimeout(timer);
        safeRemove();
        reject(predicateErr);
      }
    });
  });
  console.error(`[${logPrefix}] closing positionId=${positionId} volume=${volume}...`);
  await sendCommandWithTimeout(ds.connection, 'ProtoOAClosePositionReq', { ctidTraderAccountId: accountId, positionId, volume });
  const closeFill = await closeFillPromise;
  const closePnl = Number(closeFill.deal.closePositionDetail.grossProfit) / 100; // grossProfit is a string on this broker
  console.error(`[${logPrefix}] closed, pnl=${closePnl}`);
  return { closed: true, closePnl };
}

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
  const pendingChecklistCache = new Map(); // `${accountId}:${symbol}` -> { builtAt, payload } - see .../pending-checklist below (needs a real H1 broker fetch, same cache discipline as overlayCache)
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

  // Close a real open position from the dashboard itself (2026-09-15,
  // Esdras: "on ne voit pas d'endroit où fermer la position" - the only
  // existing close route was /admin/close-position, gated behind
  // ADMIN_EXPORT_TOKEN and meant for one-off diagnostics, not a normal
  // dashboard button). Same underlying close (closePositionOnBroker) as
  // that admin route, no separate reimplementation - just a plain
  // account-scoped route (same auth model as every other account route
  // here: none, single-user private dashboard) so the "Fermer" button can
  // call it directly. `volume` is required explicitly, same reasoning as
  // the admin route: a wrong PARTIAL volume would only partially close the
  // position, so never inferred/guessed here.
  router.post('/positions/:positionId/close', async (req, res) => {
    const store = getStore(req);
    const ds = store.liveDataSource;
    if (!ds?.connection) {
      return res.status(503).json({ error: 'not connected to a live broker' });
    }
    const positionId = Number(req.params.positionId);
    const volume = Number(req.body?.volume);
    if (!Number.isFinite(positionId) || !Number.isFinite(volume) || volume <= 0) {
      return res.status(400).json({ error: 'positionId (URL) and volume (body, broker units e.g. centilots) are both required' });
    }
    const report = { positionId, volume };
    try {
      const result = await closePositionOnBroker(ds, positionId, volume, `close-position:${store.id}`);
      res.json({ ...report, ...result });
    } catch (err) {
      res.status(502).json({ ...report, error: err.message });
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

  // "Pourquoi on n'a pas encore de trade" (2026-09-15, Esdras, sur le chart)
  // - for every zone the real engine currently still considers 'watching' on
  // this symbol, a live pass/fail per filter criterion (bias/structure/
  // session/sweep) - see cTraderDataSource.js's getPendingZoneChecklists()
  // for the full reasoning and the time-convention care it takes. Needs a
  // real H1 broker fetch for the bias item (only when the symbol's own
  // variant isn't 'baseline'), so cached the same way/same TTL as .../overlays
  // right above - watching zones don't change meaningfully faster than a new
  // M15 candle anyway.
  router.get('/pending-checklist', async (req, res) => {
    const store = getStore(req);
    const symbol = req.query.symbol;
    if (!CONFIG.symbols.includes(symbol)) {
      return res.status(400).json({ error: `Unknown symbol "${symbol}". Known: ${CONFIG.symbols.join(', ')}` });
    }
    if (store.mode !== 'live' || typeof store.liveDataSource?.getPendingZoneChecklists !== 'function') {
      return res.json({ symbol, zones: [], reason: 'not connected to a live broker' });
    }

    const cacheKey = `${store.id}:${symbol}`;
    const cached = pendingChecklistCache.get(cacheKey);
    if (cached && Date.now() - cached.builtAt < OVERLAY_CACHE_MS) {
      return res.json({ ...cached.payload, cachedAt: cached.builtAt });
    }

    try {
      const payload = await store.liveDataSource.getPendingZoneChecklists(symbol);
      pendingChecklistCache.set(cacheKey, { builtAt: Date.now(), payload });
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
  // supabaseTradeLog.js and cTraderDataSource.js's _handleExecutionEvent(),
  // which logs a REAL confirmed close - see its 2026-09-14 comment) -
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

  // Assistant IA du dashboard (2026-09-15, Esdras - voir chatAssistant.js
  // pour le contexte complet). Même modèle "sans état" que le reste de cette
  // API : le client renvoie tout l'historique de la conversation à chaque
  // question, rien n'est gardé en mémoire côté serveur entre deux appels.
  // Pas d'auth séparée - même modèle que chaque autre route de ce routeur
  // ("dashboard privé single-user", voir /positions/:id/close ci-dessus) :
  // quiconque a l'URL du dashboard peut déjà voir ces données brutes via les
  // autres routes, ce chat ne les explique qu'en langage clair.
  router.post('/chat', async (req, res) => {
    const store = getStore(req);
    if (!isChatConfigured()) {
      return res.status(503).json({ error: "L'assistant IA n'est pas configuré sur ce serveur (ANTHROPIC_API_KEY manquant)." });
    }
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    if (!message.trim()) {
      return res.status(400).json({ error: 'message requis' });
    }
    try {
      const context = await buildChatContext(store);
      const reply = await answerChatQuestion({ message, history: req.body?.history, context });
      res.json({ reply });
    } catch (err) {
      const { status, message: errMessage } = chatErrorStatus(err);
      res.status(status).json({ error: errMessage });
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
    if (typeof store.liveDataSource?.getHistoricalCandles !== 'function') {
      return res.status(503).json({ error: 'not connected to a live broker' });
    }
    // 2026-09-13: was restricted to CONFIG.symbols (the 4 live-trading
    // instruments) - loosened to any symbol the connected broker actually
    // offers, so this same export can pull real history for a candidate
    // symbol (e.g. BTCUSD, for a crypto strategy under research) BEFORE it's
    // ever added to CONFIG.symbols. getHistoricalCandles() itself already
    // rejects an unknown symbol via symbolIdByName, so this isn't opening
    // anything the broker connection didn't already allow.
    if (!store.liveDataSource.symbolIdByName?.get(symbol)) {
      return res.status(400).json({ error: `Unknown symbol "${symbol}" for this broker - see .../admin/list-symbols` });
    }
    const days = Math.min(Number(req.query.days) || 245, 245); // cTrader's own single-request cap for the M15 bucket (~35 weeks)
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

  // Read-only symbol lookup (2026-09-12, at the user's explicit request -
  // "on veut tester une paire ouverte le weekend" before trying a real
  // order-open/close cycle). CTraderDataSource._loadSymbols() already pulls
  // EVERY symbol the connected broker account offers (not just the 4
  // strategy symbols in CONFIG.symbols) into symbolIdByName on connect -
  // this just exposes that map so a crypto CFD (often tradeable on
  // weekends, unlike forex/indices/metals) can be found before attempting
  // an order. Same ADMIN_EXPORT_TOKEN gate as the other admin routes -
  // opt-in, no order can be placed from this endpoint, purely informational.
  router.get('/admin/list-symbols', (req, res) => {
    const store = getStore(req);
    const configuredToken = process.env.ADMIN_EXPORT_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: 'not enabled' });
    }
    if (req.query.token !== configuredToken) {
      return res.status(403).json({ error: 'invalid or missing token' });
    }
    if (!store.liveDataSource?.symbolIdByName || store.liveDataSource.symbolIdByName.size === 0) {
      return res.status(503).json({ error: 'not connected to a live broker, or symbol list not loaded yet' });
    }
    const filter = (req.query.filter || '').toUpperCase();
    const symbols = [...store.liveDataSource.symbolIdByName.entries()]
      .filter(([name]) => !filter || name.toUpperCase().includes(filter))
      .map(([name, id]) => ({ name, id }));
    res.json({ count: symbols.length, symbols });
  });

  // Urgent live check (2026-09-14): a BTCUSD position showed stopLoss:null
  // on the dashboard right after a LIMIT entry while its floating loss kept
  // growing - needed to confirm the broker-side protective order genuinely
  // still exists and at what price, without guessing again. Same
  // ADMIN_EXPORT_TOKEN gate as the other admin routes; read-only (never
  // calls ProtoOACancelOrderReq/ProtoOAClosePositionReq). Temporary
  // diagnostic - not wired into any UI.
  router.get('/admin/reconcile-raw', async (req, res) => {
    if (!requireAdminToken(req, res)) return;
    const store = getStore(req);
    if (typeof store.liveDataSource?.debugReconcileRaw !== 'function') {
      return res.status(503).json({ error: 'not connected to cTrader (this diagnostic only exists on that data source)' });
    }
    try {
      const result = await store.liveDataSource.debugReconcileRaw();
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Real open->close connectivity test (2026-09-12, at the user's explicit
  // request - "je veux tester ma plateforme pour la connexion", "vérifie
  // qu'une position peut s'ouvrir et fermer"). Deliberately bypasses the
  // strategy engine entirely (no FVG/signal involved) and talks to the
  // broker DIRECTLY, the same low-level way _submitOrder does, so this
  // proves the raw order-placement/close pipeline works independent of
  // whether a real signal ever fires. Defaults to BTCUSD specifically
  // because forex/indices/metals close on weekends - a crypto CFD (if the
  // broker offers one, see .../admin/list-symbols) is one of the only ways
  // to get a real fill outside market hours for the 4 strategy symbols.
  //
  // Uses the symbol's OWN minVolume (fetched live via ProtoOASymbolByIdReq,
  // never guessed/hardcoded) for the open, then ProtoOAClosePositionReq
  // (NOT an offsetting opposite-side order) to close it - an offsetting
  // order only nets exposure to zero on a NETTING account; on a HEDGING
  // account it would leave two open positions instead of actually closing
  // the first one, which would silently fail to prove what this endpoint
  // exists to prove. Same ADMIN_EXPORT_TOKEN gate as the other admin
  // routes. This places a REAL order (demo money only - store.mode is
  // always 'demo' against this broker's demo host, see _loadBalance's
  // isDemo derivation) - opt-in and deliberate, not something any other
  // route on this bot does.
  router.post('/admin/test-order-cycle', async (req, res) => {
    const store = getStore(req);
    const configuredToken = process.env.ADMIN_EXPORT_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: 'not enabled' });
    }
    if (req.query.token !== configuredToken) {
      return res.status(403).json({ error: 'invalid or missing token' });
    }
    const ds = store.liveDataSource;
    if (!ds?.connection || typeof ds.symbolIdByName?.get !== 'function') {
      return res.status(503).json({ error: 'not connected to a live broker' });
    }
    const symbolName = String(req.query.symbol || req.body?.symbol || 'BTCUSD').toUpperCase();
    const symbolId = ds.symbolIdByName.get(symbolName);
    if (symbolId == null) {
      return res.status(400).json({ error: `Unknown symbol "${symbolName}" for this broker - see .../admin/list-symbols` });
    }

    const accountId = Number(ds.accountId);
    const report = { symbol: symbolName, symbolId: Number(symbolId) };

    // BUG FOUND LIVE (2026-09-12, first real run of this endpoint): this
    // library's connection is NOT a standard Node EventEmitter -
    // CTraderLayerEmitter.on() returns a uuid, and removal is
    // removeEventListener(uuid), there is no .off(event, handler) at all.
    // The first version of this function called ds.connection.off(...),
    // which doesn't exist - a bare TypeError thrown inside a raw
    // setTimeout callback (not inside this function's own promise chain,
    // so the route's try/catch below never saw it) went fully uncaught and
    // CRASHED THE WHOLE PROCESS, twice, taking the live bot down for a few
    // seconds each time before Render's supervisor restarted it (confirmed
    // clean reconnect both times, no lasting damage - but a real incident,
    // not a hypothetical one). Fixed here using the library's real API,
    // AND every callback path now wrapped in try/catch so nothing thrown
    // in here can ever reach the process uncaught again, whatever else
    // turns out to be wrong with it.
    function waitForExecution(predicate, timeoutMs = 15000) {
      return new Promise((resolve, reject) => {
        let uuid;
        const safeRemove = () => {
          try {
            if (uuid != null) ds.connection.removeEventListener(uuid);
          } catch (removeErr) {
            console.error('[admin/test-order-cycle] removeEventListener failed (non-fatal):', removeErr);
          }
        };
        const timer = setTimeout(() => {
          safeRemove();
          reject(new Error(`timed out after ${timeoutMs}ms waiting for a matching execution event`));
        }, timeoutMs);
        uuid = ds.connection.on('ProtoOAExecutionEvent', (event) => {
          try {
            const d = event.descriptor;
            if (predicate(d)) {
              clearTimeout(timer);
              safeRemove();
              resolve(d);
            }
          } catch (predicateErr) {
            clearTimeout(timer);
            safeRemove();
            reject(predicateErr);
          }
        });
      });
    }

    // Terminal outcomes an order can reach WITHOUT ever filling - watched
    // for explicitly so a rejected/cancelled order fails fast with a clear
    // reason instead of silently burning the full 15s timeout every time
    // (the first live run gave zero visibility into why nothing matched -
    // this is what would have shown it immediately).
    const NON_FILL_TERMINAL_TYPES = new Set(['ORDER_REJECTED', 'ORDER_CANCELLED', 'ORDER_EXPIRED']);

    try {
      console.error(`[admin/test-order-cycle] start symbol=${symbolName} symbolId=${symbolId}`);
      const specRes = await sendCommandWithTimeout(ds.connection, 'ProtoOASymbolByIdReq', {
        ctidTraderAccountId: accountId,
        symbolId: [Number(symbolId)],
      });
      // Raw response kept on the report (not just console.error'd) so the
      // real shape is visible in the JSON reply itself - avoids burning
      // another live order just to go dig through Render logs when a field
      // extraction below turns out to be guessing wrong, as openOrderId
      // extraction already once did (see the 2026-09-12 timeout incident).
      report.rawSpecRes = specRes;
      const spec = specRes?.symbol?.[0];
      const volume = spec?.minVolume ? Number(spec.minVolume) : null;
      if (!volume) {
        console.error('[admin/test-order-cycle] no minVolume in spec response:', JSON.stringify(specRes));
        return res.status(502).json({ ...report, error: 'could not read this symbol\'s minVolume from the broker' });
      }
      report.volume = volume;
      console.error(`[admin/test-order-cycle] volume=${volume}, submitting MARKET BUY...`);

      // 2026-09-13, second real bug found live (first run since the
      // console.log observability fix above): ProtoOANewOrderReq's own
      // synchronous response came back as a bare `{}` on this broker - no
      // order.orderId, no orderId, nothing to extract. The OLD code below
      // used to derive openOrderId from that empty response, so the
      // waitForExecution predicate below compared the REAL orderId in every
      // ProtoOAExecutionEvent (confirmed via the new logging: orderId
      // 50183119 really did arrive, ORDER_ACCEPTED then ORDER_FILLED, ~600ms
      // after submission) against `null` - never matched, timed out at 15s,
      // and the close step never ran, leaving a REAL position open on the
      // demo account (positionId 41540705, closed manually afterward via
      // the new /admin/close-position below once this was diagnosed).
      // Fixed properly: register the fill listener BEFORE sending the
      // order and match by symbolId instead of a since-unknown orderId -
      // the FIRST fill/terminal event for this symbol is safely assumed to
      // be this order's own outcome (this endpoint is a manual, single-shot
      // admin diagnostic, never invoked concurrently with itself).
      const openFillPromise = waitForExecution((d) => {
        // Confirmed live (2026-09-13, raw event dump in cTraderDataSource.js
        // - see _waitForOrderIdBySymbol's own comment): the real field is
        // `order.tradeData.symbolId`, not the flatter `order.symbolId`
        // guessed first (which is `undefined` on this broker's real
        // response). Number(...) both sides also guards the separate
        // protobuf-string-vs-Number mismatch this same block found earlier.
        const eventSymbolId =
          d.order?.tradeData?.symbolId ?? d.order?.symbolId ?? d.position?.tradeData?.symbolId ?? d.position?.symbolId ?? d.deal?.symbolId ?? null;
        if (Number(eventSymbolId) !== Number(symbolId)) return false;
        if (NON_FILL_TERMINAL_TYPES.has(d.executionType)) {
          throw new Error(`order ${d.executionType.toLowerCase()} instead of filled (errorCode=${d.errorCode ?? 'n/a'})`);
        }
        return d.executionType === 'ORDER_FILLED' && !d.deal?.closePositionDetail;
      });
      const openRes = await sendCommandWithTimeout(ds.connection, 'ProtoOANewOrderReq', {
        ctidTraderAccountId: accountId,
        symbolId: Number(symbolId),
        orderType: 'MARKET',
        tradeSide: 'BUY',
        volume,
        label: `connectivity-test-${Date.now()}`,
        comment: 'connectivity test - opened then immediately closed by /admin/test-order-cycle',
      });
      report.rawOpenRes = openRes;
      console.error(`[admin/test-order-cycle] order sent, waiting for fill event (matched by symbolId, not orderId)...`);

      const openFill = await openFillPromise;
      const openOrderId = openFill.order?.orderId ?? null;
      report.openOrderId = openOrderId;
      const positionId = openFill.position?.positionId ?? openFill.deal?.positionId ?? null;
      report.opened = true;
      report.positionId = positionId;
      console.error(`[admin/test-order-cycle] opened, positionId=${positionId}, closing...`);
      if (positionId == null) {
        return res.status(502).json({ ...report, error: 'order filled but no positionId came back - cannot close it' });
      }

      await sendCommandWithTimeout(ds.connection, 'ProtoOAClosePositionReq', {
        ctidTraderAccountId: accountId,
        positionId: Number(positionId),
        volume,
      });
      const closeFill = await waitForExecution((d) => {
        const pid = d.deal?.positionId ?? d.position?.positionId;
        // String(...) both sides - same protobuf string-vs-number bug as
        // above; positionId here can itself already be a string (extracted
        // from openFill the same way), so normalize instead of assuming.
        if (String(pid) !== String(positionId)) return false;
        if (NON_FILL_TERMINAL_TYPES.has(d.executionType)) {
          throw new Error(`close ${d.executionType.toLowerCase()} instead of filled (errorCode=${d.errorCode ?? 'n/a'})`);
        }
        return d.executionType === 'ORDER_FILLED' && Boolean(d.deal?.closePositionDetail);
      });
      report.closed = true;
      report.closePnl = Number(closeFill.deal.closePositionDetail.grossProfit) / 100; // 2026-09-13: confirmed live this field is a STRING ("-19"), not a number - Number(...) instead of a `typeof === 'number'` guard that always failed and reported null
      console.error(`[admin/test-order-cycle] closed, pnl=${report.closePnl}`);

      res.json(report);
    } catch (err) {
      res.status(502).json({ ...report, error: err.message });
    }
  });

  // Manual real-position close (2026-09-13, added the moment the openOrderId
  // bug above was diagnosed live: test-order-cycle's close step never ran
  // because it timed out first, leaving a REAL demo position open -
  // positionId 41540705, BTCUSD - with no existing route able to flatten
  // it). Same low-level ProtoOAClosePositionReq test-order-cycle itself
  // uses, exposed standalone so a stray position (from this endpoint, a
  // manual broker-side action, or anything else) can always be closed from
  // here without waiting for another code change. Same ADMIN_EXPORT_TOKEN
  // gate; `volume` required explicitly (broker's own centilot units, e.g.
  // BTCUSD's 1 == 0.01 lot here) rather than guessed, since a wrong partial
  // volume would only partially close the position.
  router.post('/admin/close-position', async (req, res) => {
    const store = getStore(req);
    const configuredToken = process.env.ADMIN_EXPORT_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: 'not enabled' });
    }
    if (req.query.token !== configuredToken) {
      return res.status(403).json({ error: 'invalid or missing token' });
    }
    const ds = store.liveDataSource;
    if (!ds?.connection) {
      return res.status(503).json({ error: 'not connected to a live broker' });
    }
    const positionId = Number(req.query.positionId || req.body?.positionId);
    const volume = Number(req.query.volume || req.body?.volume);
    if (!Number.isFinite(positionId) || !Number.isFinite(volume) || volume <= 0) {
      return res.status(400).json({ error: 'positionId and volume (broker units, e.g. centilots) are both required' });
    }
    const report = { positionId, volume };
    try {
      const result = await closePositionOnBroker(ds, positionId, volume, 'admin/close-position');
      res.json({ ...report, ...result });
    } catch (err) {
      res.status(502).json({ ...report, error: err.message });
    }
  });

  // Manual clear of an unconfirmed "believed open" position (2026-09-13,
  // found live while chasing why BTCUSD still couldn't auto-execute after
  // the spread fix above: warm-up's own bulk replay, using the SAME live
  // netting check as real processing, had already set openPositions for
  // BTCUSD from a purely-reconstructed historical signal - never submitted
  // to the broker (warm-up NEVER does that, see cTraderDataSource.js's
  // warmUp() vs live ingestCandle() separation), `confirmed: false`,
  // maxHoldingCandles=480 on M1 = up to 8 real hours before it would clear
  // on its own. Until it clears, EVERY new candidate on that symbol is
  // netting-blocked, real signals included - the engine believes a
  // position is already open. Deliberately refuses to touch anything
  // `confirmed: true` (a real broker-confirmed fill) - clearing that would
  // let netting open a SECOND real position on top of one that's actually
  // live, a real safety hazard this check exists specifically to prevent.
  // Same ADMIN_EXPORT_TOKEN gate as every other admin route here.
  router.post('/admin/clear-believed-position', (req, res) => {
    if (!requireAdminToken(req, res)) return;
    const store = getStore(req);
    const symbol = String(req.query.symbol || req.body?.symbol || '').toUpperCase();
    if (!CONFIG.symbols.includes(symbol)) {
      return res.status(400).json({ error: `Unknown symbol "${symbol}". Known: ${CONFIG.symbols.join(', ')}` });
    }
    const position = store.strategyEngine.getOpenPosition(symbol);
    if (!position) {
      return res.json({ symbol, cleared: false, reason: 'nothing believed open for this symbol' });
    }
    const confirmed = (store.orderOutcomeLog || []).some(
      (o) => o.symbol === symbol && o.signalId === position.id && o.outcome === 'filled'
    );
    if (confirmed) {
      return res.status(409).json({ symbol, cleared: false, reason: 'this position is broker-CONFIRMED filled - refusing to clear a real position\'s belief (would let netting open a second one on top of it)' });
    }
    const cleared = store.strategyEngine.clearBelievedPosition(symbol, position.id);
    res.json({ symbol, id: position.id, cleared });
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
    } catch (err) {
      console.error(`[boot:${account.id}] live cTrader connection failed, falling back to demo mode:`, err.message);
      startMockDataSource(account);
    }
  } else {
    console.log(`[boot:${account.id}] no broker credentials configured — starting in demo mode.`);
    startMockDataSource(account);
  }
  // 2026-09-15 (Esdras: "on dirait que les nouveaux comptes suivent l'ancien
  // système trade semi-automatique") - this used to only run on the
  // successful-connection path above, so any account that hit a connection
  // failure (falls back to mock - e.g. cti-freetrial's Match-Trader login
  // blocked by a Cloudflare challenge, a persistent failure that never
  // clears on retry) NEVER got AUTO_EXECUTE_ALWAYS_ON applied, silently
  // staying on the pre-automatic default (semi-automatic) forever -
  // contradicting this env var's own documented intent ("applied to EVERY
  // account uniformly"). Mock mode itself ignores the autoExecute flag
  // entirely (ignores nothing, ALWAYS simulates), so arming it here changes
  // no simulated behavior - it only fixes what the dashboard displays for
  // that account, which is exactly the inconsistency Esdras noticed.
  armAutoExecuteIfConfigured(account);
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

    // Accounts added through the dashboard's Comptes page (2026-09-13, see
    // supabaseAccountStore.js's header for the full "sans redéployer"
    // rationale) - fetched here, normalized through the SAME
    // normalizeAccountEntry() ACCOUNTS_JSON entries go through, then
    // registered so bootAccount() below treats them identically to a
    // static account. A Supabase hiccup here never blocks the static
    // accounts (fetchDynamicAccounts() returns [] and logs, never throws).
    const dynamicRawAccounts = await fetchDynamicAccounts();
    const dynamicAccountConfigs = dynamicRawAccounts.map((raw, i) => normalizeAccountEntry(raw, CONFIG.accounts.length + i));
    for (const accountConfig of dynamicAccountConfigs) {
      registerAccount(accountConfig);
    }
    if (dynamicAccountConfigs.length > 0) {
      console.log(`[boot] ${dynamicAccountConfigs.length} account(s) loaded from Supabase: ${dynamicAccountConfigs.map((a) => a.id).join(', ')}`);
    }

    // Sequential, not parallel: keeps boot logs readable per account and
    // avoids N simultaneous cold connections at once - a few extra seconds
    // total at the "quelques comptes" scale this is designed for.
    for (const accountConfig of [...CONFIG.accounts, ...dynamicAccountConfigs]) {
      await bootAccount(accountConfig);
    }
  });
}

export default app;
