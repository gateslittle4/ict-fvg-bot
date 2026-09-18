#!/usr/bin/env node
// runFtmo1StepFullComboAccountImpact.js
// Usage: node scripts/runFtmo1StepFullComboAccountImpact.js
//
// Esdras: "Verifie pour moi tous les strategy combine, le cycle de 10% de
// ftmo avec tous ses contraintes pour les 7 derniers mois et cette semaine."
// - would the FULL current live combo (all 8 mechanisms actually wired in
// production today: FVG, Divergence, NWOG, Judas Swing, Weekly Sweep,
// Breaker Block, Silver Bullet, CBDR - see config.js) have passed FTMO's
// 1-Step Challenge (target +10%, daily loss 3%, max drawdown 10% trailing
// end-of-day - src/propFirms/ftmo.js), on REAL never-touched broker candles
// covering the last ~7 months, with a separate breakdown for the most
// recent week.
//
// Unlike every other account-impact script in this project (which
// reimplements a bespoke netting simulation per mechanism), this reuses the
// REAL production code path end to end:
//   - LiveStrategyEngine, built from CONFIG directly (not copied values) -
//     the exact same object accountRuntime.js instantiates for the real
//     live account, including every mechanism actually enabled today.
//   - A REAL GuardrailEngine, configured via accountRegistry.js's own
//     buildEffectiveConfig({ propFirmProgramId: 'ftmo-1step' }) - the exact
//     effective guardrails a real FTMO 1-Step account would run under
//     (bot's own maxTradesPerDay/cooldown from config.js's `guardrails`
//     block, FTMO's own dailyLossLimitPct/targetPct/maxDrawdownPct/Type
//     from ftmo.js) - not hand-copied, so this can never silently drift
//     from either file.
//   - LiveStrategyEngine.warmUp()'s onEvent callback, same technique
//     already used and debugged in runCbdrOverlapAnalysis.js (including the
//     Divergence symbol-order fix - US500 must warm up before US100).
//
// TWO parallel runs over the SAME merged real candle window, same config,
// only ONE difference (targetPct present vs null):
//   - "primary": the real FTMO rule, targetPct: 10. Once the account hits
//     +10%, `_blockReason()`'s guardrail check stops opening new trades
//     (profit_target_reached blocks, matching the actual live bot's
//     behavior since the 2026-09 change - see HANDOFF.md). This answers the
//     real question: did the challenge pass, when, did it ever bust first.
//   - "continuous": identical in every other way (daily loss 3%, max
//     drawdown 10% trailing-eod, maxTradesPerDay/cooldown) but targetPct:
//     null, so trading keeps going past any point the primary run would
//     have stopped. NOT a real FTMO account (nobody keeps trading a passed
//     challenge) - exists ONLY to answer "what would this week's activity
//     look like" without that answer being artificially empty just because
//     the primary run's account happened to stop trading months earlier.
//
// Data: the two most recent real cTrader exports in this repo, merged
// (deduped by timestamp) to cover the fullest real window available -
// data/real-data-2026-02-to-09/ (2026-02-13 -> 2026-09-16, ~7 months) and
// data/real-data-2026-09-17/ (2026-07-02 -> 2026-09-17, the most recent
// export, extending 25h closer to today - as close to "cette semaine" as
// real data in this repo gets). Both are genuine UTC cTrader exports -
// converted to the engine's fixed-EST-as-UTC convention the same way every
// other forward-test script in this project does.
//
// Balance sizing compounds realistically within each run: after each trade
// closes, that run's own engine balance is updated (engine.setBalance())
// so the NEXT signal's risk amount is computed off the current balance -
// same as accountRuntime.js's real setBalance() wiring.
// riskPctPerTrade: 0.5 - the validated backtest/challenge value used by
// every other FTMO account-impact script in this project
// (runFtmo1StepAccountImpact.js's own RISK_PCT).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT_PER_TRADE = 0.5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const DIR_A = 'data/real-data-2026-02-to-09';
const DIR_B = 'data/real-data-2026-09-17';

function toEngineTime(candles) {
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}

/** Merge two real-UTC candle arrays for the same symbol, deduped by timestamp, sorted ascending. */
function mergeCandles(a, b) {
  const byTime = new Map();
  for (const c of a) byTime.set(c.time, c);
  for (const c of b) byTime.set(c.time, c); // identical source on overlap - either wins
  return [...byTime.values()].sort((x, y) => x.time - y.time);
}

function fmtMoney(n) { return '$' + n.toFixed(2); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

/** Runs one full combo replay. Returns { trades, finalBalance, firstDrawdownBreach, firstTargetReached, dailyLossDays, finalStatus }. */
function runCombo({ candlesBySymbol, symbols, effective, guardrailOverrides, globalStart, globalEnd }) {
  const guardrail = new GuardrailEngine({ ...effective.guardrails, ...guardrailOverrides });
  guardrail.setBalance(STARTING_BALANCE, globalStart);

  const engine = new LiveStrategyEngine({
    symbols,
    fvgConfig: effective.fvg.perSymbol,
    divergenceConfig: effective.divergence,
    nwogConfig: effective.nwog,
    judasSwingConfig: effective.judasSwing,
    weeklySweepConfig: effective.weeklySweep,
    breakerBlockConfig: effective.breakerBlock,
    silverBulletConfig: effective.silverBullet,
    cbdrConfig: effective.cbdr,
    guardrail,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
    spreads: DEFAULT_SPREADS,
  });
  engine.setBalance(STARTING_BALANCE);

  let balance = STARTING_BALANCE;
  const pendingOpen = new Map();
  const trades = [];
  let firstDrawdownBreach = null;
  let firstTargetReached = null;
  const dailyLossDays = new Set();

  engine.warmUp(candlesBySymbol, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, {
          source: signal.source, direction: signal.direction,
          entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
          distance: signal.distance, riskAmount: signal.riskAmount, entryTime: candle.time,
        });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pendingOpen.get(signal.symbol);
      pendingOpen.delete(signal.symbol);
      if (!open) return; // defensive - netting guarantees at most one open position per symbol

      const bullish = open.direction === 'bullish';
      let exitPrice;
      if (signal.outcome === 'win') exitPrice = open.targetPrice;
      else if (signal.outcome === 'loss') exitPrice = open.stopPrice;
      else exitPrice = candle.close; // timeout - closed event carries no exit price, same convention as cbdr.js etc.

      const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
      const grossRMultiple = signedMove / open.distance;
      const spread = DEFAULT_SPREADS[signal.symbol] ?? 0;
      const costR = spread > 0 ? spread / open.distance : 0;
      const netRMultiple = grossRMultiple - costR;
      const pnl = open.riskAmount * netRMultiple;

      balance += pnl;
      engine.setBalance(balance);
      guardrail.recordTrade({ pnl, time: signal.exitTime, balanceAfter: balance, symbol: signal.symbol });

      trades.push({
        symbol: signal.symbol, source: open.source, direction: open.direction,
        entryTime: open.entryTime, exitTime: signal.exitTime, outcome: signal.outcome,
        riskAmount: open.riskAmount, netRMultiple, pnl, balanceAfter: balance,
      });

      const status = guardrail.getStatus(signal.exitTime, signal.symbol);
      if (status.overallDrawdownBreached && !firstDrawdownBreach) {
        firstDrawdownBreach = { time: signal.exitTime, balance, floor: status.overallDrawdownFloor };
      }
      if (status.targetReached && !firstTargetReached) {
        firstTargetReached = { time: signal.exitTime, balance, targetBalance: status.targetBalance };
      }
      if (status.blockReasons.includes('daily_loss_limit_reached')) dailyLossDays.add(status.dayKey);
    },
  });

  return { trades, finalBalance: balance, firstDrawdownBreach, firstTargetReached, dailyLossDays, finalStatus: guardrail.getStatus(globalEnd) };
}

function main() {
  const symbols = CONFIG.symbols; // real production list: US100/US500/XAUUSD/EURUSD/GER40

  const candlesBySymbolRaw = {};
  for (const symbol of symbols) {
    const { candles: a } = loadCandlesFromCsv(path.join(DIR_A, `${symbol}.csv`));
    const { candles: b } = loadCandlesFromCsv(path.join(DIR_B, `${symbol}.csv`));
    candlesBySymbolRaw[symbol] = toEngineTime(mergeCandles(a, b));
  }

  const globalStart = Math.min(...symbols.map((s) => candlesBySymbolRaw[s][0].time));
  const globalEnd = Math.max(...symbols.map((s) => candlesBySymbolRaw[s][candlesBySymbolRaw[s].length - 1].time));
  const weekCutoff = globalEnd - WEEK_MS;

  // Divergence pair order fix (found/documented in
  // runCbdrOverlapAnalysis.js/HANDOFF.md): warmUp() processes symbols in
  // object-key order, and the FIRST-processed leg of a Divergence pair
  // never discovers its own candidates (empty partner history at that
  // point) - US500 must go first.
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const candlesBySymbol = {};
  for (const s of orderedSymbols) candlesBySymbol[s] = candlesBySymbolRaw[s];

  const effective = buildEffectiveConfig({
    id: 'ftmo-1step-verification',
    propFirmProgramId: 'ftmo-1step',
    phaseIndex: 0,
    guardrails: CONFIG.guardrails,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
  });

  const primary = runCombo({ candlesBySymbol, symbols: orderedSymbols, effective, guardrailOverrides: {}, globalStart, globalEnd });
  const continuous = runCombo({ candlesBySymbol, symbols: orderedSymbols, effective, guardrailOverrides: { targetPct: null }, globalStart, globalEnd });

  // --- Report -----------------------------------------------------------
  const md = [];
  md.push('# Simulation compte complet — tous les mécanismes live combinés, cycle FTMO 1-Step (10%)');
  md.push('');
  md.push(
    `Question d'Esdras : "tous les strategy combiné, le cycle de 10% de FTMO avec tous ses contraintes, pour les 7 ` +
      `derniers mois et cette semaine." Rejoue la VRAIE logique de production (\`LiveStrategyEngine.warmUp()\`, la ` +
      `config réelle de \`config.js\`, les 8 mécanismes actuellement live : FVG, Divergence, NWOG, Judas Swing, ` +
      `Weekly Sweep, Breaker Block, Silver Bullet, CBDR) contre un vrai \`GuardrailEngine\` configuré EXACTEMENT ` +
      `comme un compte FTMO 1-Step Challenge réel (via \`accountRegistry.buildEffectiveConfig\`, pas des valeurs ` +
      `recopiées à la main) : cible +10%, perte quotidienne max 3%, drawdown max 10% (trailing fin de journée), ` +
      `plus les garde-fous propres du bot (max ${effective.guardrails.maxTradesPerDay} trades/jour, cooldown ` +
      `${effective.guardrails.cooldownMinutesAfterLoss} min après une perte). Données : vraies bougies cTrader ` +
      `jamais retouchées, fusion de \`data/real-data-2026-02-to-09/\` et \`data/real-data-2026-09-17/\` ` +
      `(déduplique par timestamp) — **${new Date(globalStart).toISOString().slice(0, 10)} → ` +
      `${new Date(globalEnd).toISOString().slice(0, 10)}**. Solde de départ ${fmtMoney(STARTING_BALANCE)} ` +
      `(purement pour le calcul en %, la taille réelle du compte ne change rien aux seuils), risque ${RISK_PCT_PER_TRADE}% ` +
      `par trade (valeur validée, déjà utilisée dans toutes les simulations FTMO de ce projet).`
  );
  md.push('');
  md.push(
    '⚠ Le pyramidage (`CONFIG.pyramid`) est EXCLU de cette simulation — désactivé par défaut ' +
      '(`PYRAMID_ENABLED`), non reproduit ici pour rester sur les 8 mécanismes générateurs de signaux. Si le ' +
      'pyramidage est actif en réel, ce résultat sous-estime légèrement le volume de trades (pas le risque par ' +
      'trade, chaque unité de pyramidage a son propre stop indépendant).'
  );
  md.push('');
  md.push(
    '⚠ Deux passages distincts, MÊMES données/config, une seule différence : le passage "réel" applique la règle ' +
      'FTMO réelle (cible +10% atteinte = plus aucun nouveau trade, comportement authentique du bot en production ' +
      'depuis le 2026-09) et répond à "est-ce que le challenge passe". Le passage "activité continue" retire ' +
      'uniquement ce blocage de cible (perte quotidienne/drawdown/cooldown/max-trades restent identiques et actifs) ' +
      'pour ne pas que la section "cette semaine" affiche zéro trade juste parce que le compte réel se serait déjà ' +
      'arrêté des mois plus tôt après avoir gagné le challenge — ce second passage n\'est PAS un vrai compte FTMO ' +
      '(personne ne continue de trader un challenge déjà réussi), il sert uniquement à montrer l\'activité récente ' +
      'du combo.'
  );
  md.push('');

  const totalPnl = primary.finalBalance - STARTING_BALANCE;
  const totalPct = (totalPnl / STARTING_BALANCE) * 100;
  const wins = primary.trades.filter((t) => t.pnl > 0).length;
  const losses = primary.trades.filter((t) => t.pnl <= 0).length;

  md.push('## Résultat sur les 7 mois complets (passage "réel", cible FTMO active)');
  md.push('');
  md.push(`- **${primary.trades.length} trades** au total (${wins} gagnants, ${losses} perdants, WR ${primary.trades.length ? ((wins / primary.trades.length) * 100).toFixed(1) : '—'}%)`);
  md.push(`- Solde final : ${fmtMoney(primary.finalBalance)} (${fmtPct(totalPct)})`);
  md.push(
    primary.firstTargetReached
      ? `- **✅ Cible +10% atteinte** le ${new Date(primary.firstTargetReached.time).toISOString()} (solde ${fmtMoney(primary.firstTargetReached.balance)} >= cible ${fmtMoney(primary.firstTargetReached.targetBalance)}) — le challenge aurait passé à ce moment. La règle "profit_target_reached" bloque alors toute nouvelle ouverture (comportement réel du bot depuis le 2026-09, voir HANDOFF.md), d'où le peu de trades après cette date dans ce passage.`
      : `- Cible +10% **jamais atteinte** sur cette fenêtre.`
  );
  md.push(
    primary.firstDrawdownBreach
      ? `- ❌ **Drawdown max de 10% (trailing fin de journée) FRANCHI** le ${new Date(primary.firstDrawdownBreach.time).toISOString()} (solde ${fmtMoney(primary.firstDrawdownBreach.balance)} <= plancher ${fmtMoney(primary.firstDrawdownBreach.floor)}) — le compte aurait été DISQUALIFIÉ à ce moment précis.`
      : `- ✅ Drawdown max de 10% jamais franchi sur cette fenêtre.`
  );
  md.push(
    primary.dailyLossDays.size > 0
      ? `- ⚠️ Perte quotidienne max de 3% atteinte **${primary.dailyLossDays.size} jour(s)** distinct(s) : ${[...primary.dailyLossDays].sort().join(', ')} — trading bloqué le reste de cette/ces journée(s) (pas une disqualification FTMO en soi, juste une pause forcée par le bot lui-même).`
      : `- ✅ Perte quotidienne max de 3% jamais atteinte.`
  );
  md.push('');

  md.push('| Mécanisme | Trades | Gagnants | R net moyen | PnL total |');
  md.push('|---|---|---|---|---|');
  const bySource = new Map();
  for (const t of primary.trades) {
    if (!bySource.has(t.source)) bySource.set(t.source, { n: 0, wins: 0, rSum: 0, pnl: 0 });
    const s = bySource.get(t.source);
    s.n++; if (t.pnl > 0) s.wins++; s.rSum += t.netRMultiple; s.pnl += t.pnl;
  }
  for (const [source, s] of [...bySource.entries()].sort((a, b) => b[1].n - a[1].n)) {
    md.push(`| ${source} | ${s.n} | ${s.wins} | ${(s.rSum / s.n).toFixed(2)}R | ${fmtMoney(s.pnl)} |`);
  }
  md.push('');

  // --- This week (from the "continuous" pass - see warning above) --------
  const weekTrades = continuous.trades.filter((t) => t.entryTime >= weekCutoff);
  const weekPnl = weekTrades.reduce((sum, t) => sum + t.pnl, 0);
  const weekWins = weekTrades.filter((t) => t.pnl > 0).length;

  md.push(`## Cette semaine (${new Date(weekCutoff).toISOString().slice(0, 10)} → ${new Date(globalEnd).toISOString().slice(0, 10)}, passage "activité continue")`);
  md.push('');
  if (weekTrades.length === 0) {
    md.push('Aucun trade sur cette fenêtre, même sans le blocage de cible.');
  } else {
    md.push(`- **${weekTrades.length} trade(s)** (${weekWins} gagnant(s)) — PnL ${fmtMoney(weekPnl)} (${fmtPct((weekPnl / STARTING_BALANCE) * 100)} du solde de départ de ce passage)`);
    md.push('');
    md.push('| Date entrée | Symbole | Mécanisme | Direction | Issue | R net | PnL |');
    md.push('|---|---|---|---|---|---|---|');
    for (const t of weekTrades) {
      md.push(
        `| ${new Date(t.entryTime).toISOString().slice(0, 16).replace('T', ' ')} | ${t.symbol} | ${t.source} | ` +
          `${t.direction} | ${t.outcome} | ${t.netRMultiple.toFixed(2)}R | ${fmtMoney(t.pnl)} |`
      );
    }
  }
  md.push('');
  md.push(
    `Statut garde-fous à la fin de cette semaine (passage "réel") : ${primary.finalStatus.blocked ? '🔴 bloqué (' + primary.finalStatus.blockReasons.join(', ') + ')' : '🟢 rien de bloqué'}.`
  );

  const outMd = path.join(DIR_A, 'ftmo-1step-full-combo-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
  console.error(`[primary] trades=${primary.trades.length} finalBalance=${fmtMoney(primary.finalBalance)} (${fmtPct(totalPct)})`);
  console.error(`[primary] target reached: ${primary.firstTargetReached ? new Date(primary.firstTargetReached.time).toISOString() : 'never'}`);
  console.error(`[primary] drawdown breached: ${primary.firstDrawdownBreach ? new Date(primary.firstDrawdownBreach.time).toISOString() : 'never'}`);
  console.error(`[continuous] trades=${continuous.trades.length} finalBalance=${fmtMoney(continuous.finalBalance)}`);
  console.error(`[continuous] week trades=${weekTrades.length}`);
}

main();
