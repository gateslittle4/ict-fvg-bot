// faithfulBotTrades.js
// The bot's trades as the Simulateur shows them (2026-09-25, Esdras: "le simulateur n'est plus vrai"). Until then the page ran
// the old backtest modules one mechanism at a time: no one-position-per-pair netting, no guardrails, no spread-shifted market
// execution, no RSI(2), no A/B, and GER40 still traded after it was retired. Now the "bot" option shows the trades of the
// FAITHFUL replay (scripts/runLiveReplay.js: the live LiveStrategyEngine + IntradayMomentumEngine + DailyAlertEngine, the shared
// entry rules of src/execution/entryPolicy.js, M1 exits), precomputed by scripts/buildSimulatorTrades.js into
// data/simulator/bot-trades.json (HistData M1 until 2022, the broker's M1 after).
//
// Trades come back in the Simulateur's shape, engine time, with `exact: true`: the page takes their entry, exit and R as they
// are (the replay already paid the spread and the swap, and already applied the netting and the guardrails).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAITHFUL_TRADES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'simulator', 'bot-trades.json');

/** The bot's live strategies, by the replay's `source` name. */
export const LIVE_BOT_STRATEGIES = [
  { id: 'bot-divergence', source: 'divergence', label: 'Divergence US100/US500' },
  { id: 'bot-nwog', source: 'nwog', label: 'NWOG (gap de semaine)' },
  { id: 'bot-weekly', source: 'weeklysweep', label: 'Weekly Sweep' },
  { id: 'bot-silver', source: 'silverbullet', label: 'Silver Bullet' },
  { id: 'bot-cbdr', source: 'cbdr', label: 'CBDR' },
  { id: 'bot-rsi2', source: 'rsi2-daily', label: 'RSI(2) journalier' },
  { id: 'bot-orb5', source: 'orb5', label: 'A (ORB 5 min)' },
  { id: 'bot-noise', source: 'noise', label: 'B (zone de bruit)' },
];
export const LIVE_BOT_IDS = LIVE_BOT_STRATEGIES.map((s) => s.id);
const bySource = new Map(LIVE_BOT_STRATEGIES.map((s) => [s.source, s]));

let loaded = null; // { mtimeMs, file }
/** The precomputed file (re-read when it changes on disk), or null when it is absent. */
export function loadFaithfulFile(file = FAITHFUL_TRADES_PATH) {
  if (!fs.existsSync(file)) return null;
  const mtimeMs = fs.statSync(file).mtimeMs;
  if (loaded?.path !== file || loaded.mtimeMs !== mtimeMs) loaded = { path: file, mtimeMs, file: JSON.parse(fs.readFileSync(file, 'utf8')) };
  return loaded.file;
}

/** Which live strategies really traded this symbol in the faithful replay ([] for a pair the bot does not trade, e.g. GER40). */
export function liveBotStrategiesForSymbol(symbol, file = loadFaithfulFile()) {
  if (!file) return [];
  const sources = new Set(file.trades.filter((t) => t[0] === symbol).map((t) => t[1]));
  return LIVE_BOT_STRATEGIES.filter((s) => sources.has(s.source)).map(({ id, label }) => ({ id, label }));
}

/**
 * One strategy's faithful trades on one symbol, Simulateur-shaped (engine time), or null when it never traded there.
 * Row: [symbol, source, dir (1 buy / -1 sell), entryTime, exitTime, entryPrice (bid), stopPrice, targetPrice|null, exitPrice (fill), r, reason]
 */
export function faithfulTrades(id, symbol, file = loadFaithfulFile()) {
  const strat = LIVE_BOT_STRATEGIES.find((s) => s.id === id);
  if (!strat || !file) return null;
  const rows = file.trades.filter((t) => t[0] === symbol && t[1] === strat.source);
  if (!rows.length) return null;
  return rows.map(([, source, dir, entryTime, exitTime, entryPrice, stopPrice, targetPrice, exitPrice, r, reason]) => ({
    strategyId: bySource.get(source).id,
    direction: dir > 0 ? 'bullish' : 'bearish',
    entryTime, entryPrice, stopPrice, targetPrice: targetPrice ?? null, exitTime, exitPrice,
    outcome: reason, rMultiple: r, exact: true,
  }));
}
