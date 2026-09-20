// stopFloorCore.js - shared by the stop-floor / FTMO-plan studies (2026-09-20).
// Raw trades of the bot's 8 mechanisms -> re-resolved under any per-mechanism ATR stop floor with ONE honest rule
// (entry judged from its own candle, stop wins ties, spread as spread/d, bot viability filter stop >= 3x spread,
// light guardrails: 1 open position per symbol, 3 trades/day, 30 min pause after a loss, day stopped at -4R).
import { DEFAULT_SPREADS } from '../../src/backtest/transactionCosts.js';
import { BOT_MECHANISMS, runReplayStrategy } from '../../src/backtest/replaySignals.js';
import { CONFIG } from '../../src/config.js';
import { GuardrailEngine } from '../../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../../src/accountRegistry.js';

export const DAY = 86400000;
const PRIORITY = Object.fromEntries(BOT_MECHANISMS.map((m, i) => [m.id, i]));
export const unitOf = (t) => `${t.symbol} ${t.id.replace('bot-', '')}`;

/** load(symbol) -> engine-time candles. Returns { all, cache } where all = sorted raw trades. */
export function buildTrades(symbols, load, log = () => {}) {
  const all = []; const cache = {};
  for (const symbol of symbols) {
    cache[symbol] ??= load(symbol);
    const candles = cache[symbol];
    const ids = BOT_MECHANISMS.filter((m) => m.symbolsOf().includes(symbol));
    const tr = new Float64Array(candles.length);
    for (let i = 1; i < candles.length; i++) tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
    const atrAt = (i) => { let a = 0, k = 0; for (let j = Math.max(1, i - 13); j <= i; j++) { a += tr[j]; k++; } return k ? a / k : 0; };
    const indexOf = new Map(candles.map((c, i) => [c.time, i]));
    for (const m of ids) {
      let partner = null;
      if (m.needsPartner) { const p = m.partnerOf(symbol); cache[p] ??= load(p); partner = cache[p]; }
      const list = runReplayStrategy(m.id, candles, symbol, partner) ?? [];
      let kept = 0;
      for (const t of list) {
        const i0 = indexOf.get(t.entryTime);
        if (i0 === undefined || i0 < 20) continue;
        const dist = Math.abs(t.entryPrice - t.stopPrice);
        if (!(dist > 0)) continue;
        let tdist = Number.isFinite(t.targetPrice) && t.targetPrice !== null ? Math.abs(t.targetPrice - t.entryPrice) : null;
        if (tdist === null) tdist = (m.id === 'bot-divergence' ? CONFIG.divergence?.rrMultiple ?? 3 : 3) * dist;
        all.push({ symbol, id: m.id, dir: t.direction === 'bullish' ? 1 : -1, time: t.entryTime, i0, entry: t.entryPrice, dist, rr: tdist / dist, atr: atrAt(i0 - 1) });
        kept++;
      }
      log(`  ${symbol} ${m.id}: ${list.length} raw, ${kept} usable`);
    }
  }
  all.sort((a, b) => a.time - b.time || PRIORITY[a.id] - PRIORITY[b.id]);
  return { all, cache };
}

export function makeSimulator({ all, cache }) {
  function resolve(t, d) {
    const cs = cache[t.symbol];
    const stop = t.entry - t.dir * d, tp = t.entry + t.dir * d * t.rr;
    for (let i = t.i0; i < cs.length && i - t.i0 < 480; i++) {
      const c = cs[i];
      if (t.dir === 1 ? c.low <= stop : c.high >= stop) return { r: -1, exit: c.time };
      if (t.dir === 1 ? c.high >= tp : c.low <= tp) return { r: t.rr, exit: c.time };
    }
    const c = cs[Math.min(cs.length - 1, t.i0 + 479)];
    return { r: (t.dir * (c.close - t.entry)) / d, exit: c.time };
  }
  /** kOf(unit) -> ATR floor multiple (0 = the mechanism's own stop); include = Set of units or null; fromTime/toTime restrict the entry window */
  return function simulate(kOf, include = null, { fromTime = -Infinity, toTime = Infinity, resolver = null } = {}) {
    const openUntil = {}; const dayCount = new Map(); const dayR = new Map(); const losses = []; const out = [];
    for (const t of all) {
      if (t.time < fromTime || t.time >= toTime) continue;
      const u = unitOf(t);
      if (include && !include.has(u)) continue;
      const k = kOf(u);
      const d = k ? Math.max(t.dist, k * t.atr) : t.dist;
      const spread = DEFAULT_SPREADS[t.symbol] ?? 0;
      if (spread > 0 && d < 3 * spread) continue;
      if ((openUntil[t.symbol] ?? -1) > t.time) continue;
      const day = Math.floor(t.time / DAY);
      if ((dayCount.get(day) ?? 0) >= 3 || (dayR.get(day) ?? 0) <= -4) continue;
      if (losses.some((x) => x <= t.time && t.time < x + 30 * 60000)) continue;
      const res = resolver ? resolver(t, d, resolve) : resolve(t, d);
      if (!res) continue; // e.g. an entry that never filled at minute resolution
      const net = res.r - spread / d;
      openUntil[t.symbol] = res.exit;
      dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
      dayR.set(day, (dayR.get(day) ?? 0) + (res.exit - t.time < DAY ? net : 0));
      if (net < 0) { losses.push(res.exit); if (losses.length > 400) losses.splice(0, 200); }
      out.push({ ...t, net, exit: res.exit, unit: u, k });
    }
    return out;
  };
}

const effective = buildEffectiveConfig({ id: 'ftmo-plan', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: 0.5 });
/** FTMO 1-Step attempts (+10 %, trailing end-of-day 10 % max loss, 10 000 $ each). riskOf(balance, attemptStartBalance) -> risk fraction of balance */
export function ftmoAttempts(list, riskOf = () => 0.005) {
  const sorted = [...list].sort((a, b) => a.exit - b.exit);
  let g = null, bal = 10000; let cur = 0; const passDays = []; const attempts = [];
  for (const t of sorted) {
    if (!g) { g = new GuardrailEngine({ ...effective.guardrails, targetPct: 10 }); bal = 10000; g.setBalance(bal, t.exit); cur = t.exit; }
    const pnl = bal * riskOf(bal, 10000) * t.net; bal += pnl;
    g.recordTrade({ pnl, time: t.exit, balanceAfter: bal, symbol: t.symbol });
    const st = g.getStatus(t.exit, t.symbol);
    if (st.targetReached) { attempts.push({ from: cur, to: t.exit, result: 'PASS', end: bal }); passDays.push((t.exit - cur) / DAY); g = null; }
    else if (st.overallDrawdownBreached) { attempts.push({ from: cur, to: t.exit, result: 'FAIL', end: bal }); g = null; }
  }
  if (g) attempts.push({ from: cur, to: sorted[sorted.length - 1]?.exit ?? cur, result: 'EN COURS', end: bal });
  passDays.sort((a, b) => a - b);
  return { pass: attempts.filter((a) => a.result === 'PASS').length, fail: attempts.filter((a) => a.result === 'FAIL').length, medDays: passDays.length ? passDays[Math.floor(passDays.length / 2)] : null, attempts };
}

// Recommended configuration from mechanisms-stop-floor-2010-2025.md (decided on <= 2023 only): units to keep with their floor
export const RECOMMENDED = {
  'XAUUSD fvg': 3, 'EURUSD judas': 3, 'US100 silver': 3, 'GER40 silver': 2, 'US500 fvg': 0, 'GER40 nwog': 3, 'GER40 weekly': 0,
  'GER40 breaker': 2, 'US500 divergence': 1, 'US500 weekly': 0, 'US100 divergence': 3, 'US100 nwog': 1, 'US100 fvg': 1,
};
export const DROPPED = ['US500 silver', 'US100 cbdr'];
