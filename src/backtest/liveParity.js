// liveParity.js
// "Le bot en direct a-t-il vu les mêmes signaux que le moteur sur les bougies COMPLÈTES ?" (2026-09-21, après deux incidents :
// signal Weekly Sweep US500 manqué à cause de bougies « premier tick », signal NWOG manqué à cause du sommeil du serveur).
// Rejoue le vrai LiveStrategyEngine sur les bougies finales du broker, garde les signaux PROPRES (validated sans blockedReason),
// et les compare aux événements « signal » que le bot a réellement traités (bot_order_events, ou les journaux du serveur).
import { LiveStrategyEngine } from '../liveStrategyEngine.js';
import { GuardrailEngine } from '../engines/guardrailEngine.js';
import { FIXED_EST_TO_UTC_OFFSET_MS as OFF } from './nySession.js';
import { DEFAULT_SPREADS } from './transactionCosts.js';
import { CONFIG } from '../config.js';

/**
 * @param {Record<string, Array<{time:number,open:number,high:number,low:number,close:number}>>} candlesRealUtc bougies M15 finales, heure UTC RÉELLE
 * @returns {Array<{timeMs:number, symbol:string, source:string, side:'buy'|'sell', entry:number, stop:number, blocked:string|null}>} tous les signaux 'validated' (propres ET bloqués) dans [fromMs, toMs], heure UTC réelle de la bougie d'entrée
 */
export function replaySignals(candlesRealUtc, { fromMs = -Infinity, toMs = Infinity, config = CONFIG, balance = 10000 } = {}) {
  const symbols = Object.keys(candlesRealUtc);
  const engineCandles = Object.fromEntries(symbols.map((s) => [s, candlesRealUtc[s].map((c) => ({ ...c, time: c.time - OFF }))]));
  const guard = new GuardrailEngine(config.guardrails);
  guard.setBalance(balance, Date.now());
  const engine = new LiveStrategyEngine({
    symbols,
    fvgConfig: config.fvg.perSymbol, divergenceConfig: config.divergence, nwogConfig: config.nwog, judasSwingConfig: config.judasSwing,
    weeklySweepConfig: config.weeklySweep, breakerBlockConfig: config.breakerBlock, silverBulletConfig: config.silverBullet, cbdrConfig: config.cbdr,
    guardrail: guard, riskPctPerTrade: config.risk?.riskPctPerTrade ?? 0.3, spreads: DEFAULT_SPREADS,
  });
  engine.setBalance(balance);
  const out = [];
  engine.warmUp(engineCandles, {
    onEvent: (sig, candle) => {
      if (sig.type !== 'validated') return;
      const timeMs = candle.time + OFF;
      if (timeMs < fromMs || timeMs > toMs) return;
      out.push({ timeMs, symbol: sig.symbol, source: sig.source, side: sig.suggestedSide, entry: sig.entryPrice, stop: sig.stopPrice, blocked: sig.blockedReason ?? null });
    },
  });
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * @param replay sorties de replaySignals
 * @param live   [{timeMs, symbol, source, side}] signaux que le bot a réellement traités
 * @returns {{matched:Array, missingInLive:Array, extraInLive:Array, blockedInReplay:Array}}
 *   matched : signal propre au rejeu ET vu en direct ; missingInLive : propre au rejeu, absent en direct ;
 *   extraInLive : vu en direct, absent du rejeu (ou bloqué au rejeu : voir blockedInReplay pour la raison)
 */
export function compareSignals(replay, live, { toleranceMs = 3 * 60 * 1000 } = {}) {
  const clean = replay.filter((r) => !r.blocked);
  const blocked = replay.filter((r) => r.blocked);
  const usedLive = new Set();
  const same = (a, b) => a.symbol === b.symbol && a.source === b.source && a.side === b.side && Math.abs(a.timeMs - b.timeMs) <= toleranceMs;
  const matched = [], missingInLive = [];
  for (const r of clean) {
    const i = live.findIndex((l, k) => !usedLive.has(k) && same(r, l));
    if (i >= 0) { usedLive.add(i); matched.push({ replay: r, live: live[i] }); } else missingInLive.push(r);
  }
  const extraInLive = live.filter((_, k) => !usedLive.has(k)).map((l) => {
    const b = blocked.find((r) => same(r, l));
    return { ...l, replayBlockedReason: b ? b.blocked : null };
  });
  return { matched, missingInLive, extraInLive, blockedInReplay: blocked };
}

export const fmtUtc = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
