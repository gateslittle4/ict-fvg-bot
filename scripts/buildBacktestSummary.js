#!/usr/bin/env node
// buildBacktestSummary.js
// Usage: node scripts/buildBacktestSummary.js
//
// Esdras, pour le chat IA du dashboard : "comment faire pour qu'il ai Les
// données des 7 annees?". Le journal durable Supabase (voir chatAssistant.js)
// ne couvre que le trading réel depuis que la persistance est en place -
// il ne contient PAS le backtest 2019-2025 déjà utilisé dans le rapport PDF
// investisseur (checkAugustSeasonalityAcrossYears.js,
// checkMonthlySeasonalityAndChallengeStart.js). Rejouer 7 années de bougies
// à CHAQUE message de chat serait beaucoup trop lent (plusieurs secondes) -
// ce script fait le rejeu UNE FOIS, ici, et écrit un résumé compact dans
// data/backtest-summary.json, que chatAssistant.js charge ensuite en
// lecture simple (quelques ms) à chaque question.
//
// Même construction EXACTE du combo de production que tous les scripts
// jumeaux de cette session (checkAugustSeasonalityAcrossYears.js en
// particulier - même symboles réels, même config, BTCUSD exclu pour la même
// raison : smoke-test technique, pas un mécanisme validé). Ne recalcule
// rien de nouveau - même replayAll()/partA_monthlyBreakdown() que
// checkMonthlySeasonalityAndChallengeStart.js, plus un découpage par année
// et par symbole/mécanisme, exportés en JSON au lieu d'un simple console.log.
//
// À relancer manuellement si la stratégie/la config change un jour (le
// fichier généré est committé, pas régénéré au démarrage du serveur - un
// résumé de backtest ne change pas tout seul).

import fs from 'node:fs';
import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const CSV_DIR = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'backtest-input');
const OUT_PATH = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'backtest-summary.json');
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function replayAll() {
  const historyBySymbol = {};
  let earliestTime = Infinity;
  let latestTime = -Infinity;
  for (const symbol of REAL_SYMBOLS) {
    const candles = loadCandlesFromCsv(path.join(CSV_DIR, `${symbol}.csv`)).candles;
    historyBySymbol[symbol] = candles;
    earliestTime = Math.min(earliestTime, candles[0].time);
    latestTime = Math.max(latestTime, candles[candles.length - 1].time);
  }
  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const fvgConfigRealOnly = { ...CONFIG.fvg.perSymbol };
  delete fvgConfigRealOnly.BTCUSD;
  const engine = new LiveStrategyEngine({
    symbols: REAL_SYMBOLS,
    fvgConfig: fvgConfigRealOnly,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    spreads: DEFAULT_SPREADS,
    pyramidConfig: CONFIG.pyramid,
  });
  const openById = new Map();
  const trades = [];
  engine.warmUp(historyBySymbol, {
    onEvent: (e) => {
      if (!e) return;
      if (e.type === 'validated' && !e.blockedReason) { openById.set(e.id, e); return; }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return;
      openById.delete(e.id);
      trades.push({
        symbol: e.symbol,
        source: opened.source,
        entryTime: opened.validatedAt,
        exitTime: e.exitTime,
        outcome: e.outcome,
        rMultiple: e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null,
      });
    },
  });
  trades.sort((a, b) => a.entryTime - b.entryTime);
  return { trades, earliestTime, latestTime };
}

function emptyBucket() {
  return { count: 0, wins: 0, losses: 0, totalR: 0 };
}
function accumulate(bucket, t) {
  bucket.count++;
  if (t.outcome === 'win') bucket.wins++;
  else if (t.outcome === 'loss') bucket.losses++;
  bucket.totalR += t.rMultiple || 0;
}
function finalize(bucket) {
  const decided = bucket.wins + bucket.losses;
  bucket.winRatePct = decided > 0 ? Math.round((bucket.wins / decided) * 1000) / 10 : null;
  bucket.totalR = Math.round(bucket.totalR * 100) / 100;
  return bucket;
}

function main() {
  const { trades, earliestTime, latestTime } = replayAll();

  // 2026-09-16 (Esdras, explicite : "Tous Les nvs tests doivent inclure
  // Tous Les annees maintenant") - le filtre 2019-2025 qui existait ici
  // avant (voir git log de ce fichier pour le raisonnement d'alors) est
  // délibérément RETIRÉ. Chaque symbole a maintenant son propre historique
  // réel le plus long possible (US100/US500 depuis 2010-11-14, XAUUSD
  // depuis 2009-03-15, GER40 depuis ~2010, EURUSD reste le plus court à
  // 2018-01-01 - donc Judas Swing/EURUSD ne démarre qu'en 2018 même si les
  // autres mécanismes tournent depuis 2009-2010) - AUCUNE homogénéisation
  // artificielle à une fenêtre commune, chaque bougie réellement disponible
  // compte. Cohérent avec le correctif déjà appliqué à la comparaison prop
  // firm (voir HANDOFF.md "CORRECTIF IMPORTANT") qui avait la même
  // discipline pour la même raison : une fenêtre plus courte peut donner une
  // fausse impression de robustesse en ratant des régimes de marché plus
  // anciens.
  const years = new Set(trades.map((t) => new Date(t.entryTime).getUTCFullYear()));
  const yearsSorted = [...years].sort((a, b) => a - b);
  const decided = trades.filter((t) => t.outcome === 'win' || t.outcome === 'loss');

  const overall = emptyBucket();
  const byYear = {};
  const byMonth = Array.from({ length: 12 }, () => emptyBucket());
  const bySymbol = {};
  const bySource = {};

  for (const t of trades) {
    accumulate(overall, t);
    const year = new Date(t.entryTime).getUTCFullYear();
    byYear[year] ??= emptyBucket();
    accumulate(byYear[year], t);
    accumulate(byMonth[new Date(t.entryTime).getUTCMonth()], t);
    bySymbol[t.symbol] ??= emptyBucket();
    accumulate(bySymbol[t.symbol], t);
    bySource[t.source] ??= emptyBucket();
    accumulate(bySource[t.source], t);
  }

  finalize(overall);
  for (const y of Object.values(byYear)) finalize(y);
  for (const m of byMonth) finalize(m);
  for (const s of Object.values(bySymbol)) finalize(s);
  for (const s of Object.values(bySource)) finalize(s);

  const byMonthNamed = {};
  MONTH_NAMES.forEach((name, i) => { byMonthNamed[name] = byMonth[i]; });

  const summary = {
    generatedAt: new Date().toISOString(),
    coverage: {
      from: new Date(earliestTime).toISOString().slice(0, 10),
      to: new Date(latestTime).toISOString().slice(0, 10),
      years: yearsSorted,
    },
    note: `Backtest sur l'historique réel complet disponible par symbole (${new Date(earliestTime).toISOString().slice(0, 10)} -> ${new Date(latestTime).toISOString().slice(0, 10)}, ${yearsSorted.length} années calendaires), rejoué avec le code EXACT de production (mêmes mécanismes, mêmes réglages). EURUSD (Judas Swing) démarre en 2018-01-01, plus tard que les autres symboles - pas d'homogénéisation artificielle à une fenêtre commune. Performance passée, ne garantit pas les résultats futurs. BTCUSD exclu (smoke-test technique récent, pas un mécanisme validé). Symboles inclus : US100, US500, XAUUSD, EURUSD, GER40.`,
    decidedTradeCount: decided.length,
    overall,
    byYear,
    byMonth: byMonthNamed,
    bySymbol,
    bySource,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
  console.log(`Résumé écrit dans ${OUT_PATH}`);
  console.log(`${decided.length} trades décidés, ${overall.totalR >= 0 ? '+' : ''}${overall.totalR}R au total, ${overall.winRatePct}% de réussite.`);
}

main();
