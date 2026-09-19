// tradeDebrief.js
// Automatic debrief of ONE closed trade (2026-09-19, roadmap: "journal auto-annoté" and
// the base of the "mentor"). Everything is a plain fact computed from the trade and the
// market data around it - the session it was taken in, the levels it was next to, how far
// price went for and against it, how comparable trades did historically - written as short
// sentences. No model is involved here: an optional AI comment (chatAssistant.js) is built
// FROM these facts and never invents any.
//
// Times: `trade` carries real UTC instants (what the journal shows); candles and the
// caller-supplied entryEngine/exitEngine are in ENGINE time (fixed UTC-5), the convention
// the session and level helpers use.

import { toRealNyHourMinute } from './nySession.js';
import { computeDailyLevels, rebaseLevels, SESSION_WINDOWS } from './dailyLevels.js';

const HOUR = 3600000;
const NEAR_PCT = 0.25; // a level within 0.25 % of the entry price counts as "next to" it

const pctText = (v) => `${Math.abs(v).toFixed(2).replace('.', ',')} %`;
const rText = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')}R`;
const hh = (h) => `${String(Math.floor(h)).padStart(2, '0')}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Which session windows an engine-time instant falls in (New York local hours). */
export function sessionsAt(engineTime, windows = SESSION_WINDOWS) {
  const { hour, minute } = toRealNyHourMinute(engineTime);
  const decimal = hour + minute / 60;
  return windows.filter((w) => decimal >= w.startHour && decimal < w.endHour);
}

/**
 * @param {object} p
 * @param {{symbol:string, direction:'bullish'|'bearish', source?:string, entryPrice:number, exitPrice?:number, rMultiple?:number|null, pnl?:number|null}} p.trade
 * @param {Array} p.candles - M15 candles, engine time, oldest first
 * @param {number} p.entryEngine
 * @param {number} p.exitEngine
 * @param {{sessionWindow?:{startHour:number,endHour:number}}|null} [p.config] - the bot's live FVG config for this symbol, if any
 * @param {object|null} [p.context] - signalContext() result for this trade's kind, if available
 * @returns {{notes:Array<{level:'good'|'info'|'warn', text:string}>, facts:object}}
 */
export function buildTradeDebrief({ trade, candles, entryEngine, exitEngine, config = null, context = null }) {
  const notes = [];
  const bullish = trade.direction === 'bullish';
  const sessions = sessionsAt(entryEngine);
  const ny = toRealNyHourMinute(entryEngine);
  const holdHours = (exitEngine - entryEngine) / HOUR;
  const facts = { entryNy: hh(ny.hour + ny.minute / 60), sessions: sessions.map((s) => s.label), holdHours };

  // --- when ---
  if (sessions.length) notes.push({ level: 'info', text: `Entrée à ${facts.entryNy} (New York), dans : ${sessions.map((s) => s.label).join(', ')}.` });
  else notes.push({ level: 'info', text: `Entrée à ${facts.entryNy} (New York), en dehors de toutes les sessions suivies.` });

  // --- against the bot's own rules ---
  const win = config && config.sessionWindow;
  if (win && (trade.source === 'fvg' || !trade.source)) {
    const decimal = ny.hour + ny.minute / 60;
    if (decimal >= win.startHour && decimal < win.endHour) {
      notes.push({ level: 'good', text: `Dans la fenêtre de session du bot pour ${trade.symbol} (${win.startHour}h–${win.endHour}h).` });
    } else {
      notes.push({ level: 'warn', text: `Hors de la fenêtre de session du bot pour ${trade.symbol} (${win.startHour}h–${win.endHour}h) : ce trade ne vient pas du signal filtré du bot tel qu'il est réglé.` });
    }
  }

  // --- the levels next to the entry ---
  const before = candles.filter((c) => c.time <= entryEngine);
  const covers = before.length > 0 && entryEngine - before[before.length - 1].time <= 2 * HOUR;
  if (covers && trade.entryPrice > 0) {
    const levels = computeDailyLevels(before.slice(-15 * 96));
    if (levels) {
      const near = rebaseLevels(levels, trade.entryPrice).levels
        .filter((l) => Math.abs(l.distancePct) <= NEAR_PCT)
        .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))
        .slice(0, 3);
      facts.nearLevels = near.map((l) => ({ label: l.label, distancePct: l.distancePct }));
      if (near.length) {
        notes.push({ level: 'info', text: `Niveaux à moins de ${pctText(NEAR_PCT)} de l'entrée : ${near.map((l) => `${l.label} (${Math.abs(l.distancePct) < 0.005 ? 'au niveau exact' : `${pctText(l.distancePct)} ${l.distancePct > 0 ? 'au-dessus' : 'en dessous'}`})`).join(' ; ')}.` });
      } else {
        notes.push({ level: 'info', text: `Aucun niveau clé (veille, semaine, minuit, ranges) à moins de ${pctText(NEAR_PCT)} de l'entrée.` });
      }
    }
  } else {
    notes.push({ level: 'info', text: 'Contexte de marché indisponible : ce trade est plus ancien que l\'historique de bougies gardé par le bot.' });
  }

  // --- what price did while the trade was open ---
  const during = candles.filter((c) => c.time >= entryEngine && c.time <= exitEngine);
  if (during.length && trade.entryPrice > 0) {
    const highest = Math.max(...during.map((c) => c.high));
    const lowest = Math.min(...during.map((c) => c.low));
    const favourable = ((bullish ? highest - trade.entryPrice : trade.entryPrice - lowest) / trade.entryPrice) * 100;
    const adverse = ((bullish ? trade.entryPrice - lowest : highest - trade.entryPrice) / trade.entryPrice) * 100;
    facts.favourablePct = Math.max(0, favourable);
    facts.adversePct = Math.max(0, adverse);
    notes.push({ level: 'info', text: `Pendant le trade (${holdHours < 1 ? `${Math.round(holdHours * 60)} min` : `${holdHours.toFixed(1).replace('.', ',')} h`}), le prix est allé jusqu'à ${pctText(facts.favourablePct)} en ta faveur et ${pctText(facts.adversePct)} contre toi.` });
    const lost = trade.rMultiple !== null && trade.rMultiple !== undefined ? trade.rMultiple < 0 : trade.pnl < 0;
    if (lost && facts.favourablePct > 0.3 && facts.favourablePct > facts.adversePct) {
      notes.push({ level: 'warn', text: `Le trade a été dans le vert (jusqu'à ${pctText(facts.favourablePct)}) avant de finir en perte : à regarder si une sortie partielle ou un stop au point d'entrée aurait eu du sens sur ce type de setup — sans en faire une règle sur un seul trade.` });
    }
    if (!lost && facts.adversePct > facts.favourablePct) {
      notes.push({ level: 'info', text: `Gagnant, mais il a d'abord subi ${pctText(facts.adversePct)} contre lui : le stop a bien tenu, l'entrée aurait pu être plus fine.` });
    }
  }

  // --- how the result compares with the strategy's history ---
  if (trade.rMultiple !== null && trade.rMultiple !== undefined) {
    notes.push({ level: trade.rMultiple >= 0 ? 'good' : 'info', text: `Résultat : ${rText(trade.rMultiple)}.` });
  }
  if (context && context.primary && context.primary.id !== 'all') {
    const p = context.primary;
    const avg = context.baseline.expectancy;
    notes.push({
      level: context.verdict === 'above' ? 'good' : context.verdict === 'below' ? 'warn' : 'info',
      text: `Historiquement, les signaux comparables (${p.label}) ont fait ${rText(p.expectancy)} en moyenne sur ${p.n} trades (la stratégie entière : ${rText(avg)})` +
        `${context.verdict === 'above' ? ', un groupe meilleur que la moyenne' : context.verdict === 'below' ? ', un groupe moins bon que la moyenne' : ', pas distinguable de la moyenne'}. Un seul trade ne prouve rien dans un sens ou dans l'autre.`,
    });
    facts.historical = { label: p.label, n: p.n, expectancy: p.expectancy, verdict: context.verdict };
  }

  return { notes, facts };
}
