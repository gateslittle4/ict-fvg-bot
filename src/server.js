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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/status', (req, res) => {
  const guardrailStatus = store.guardrail.getStatus();
  const symbols = CONFIG.symbols.map((symbol) => {
    const last = store.lastCandleBySymbol.get(symbol);
    return {
      symbol,
      lastPrice: last ? last.close : null,
      lastCandleTime: last ? last.time : null,
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
