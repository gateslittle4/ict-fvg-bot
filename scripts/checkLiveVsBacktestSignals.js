#!/usr/bin/env node
// checkLiveVsBacktestSignals.js - chasse aux bugs « le live ne voit pas ce que le backtest voit » (Esdras, 2026-09-23 :
// « corrige d'abord tous les bugs du robot »).
//
// Pour chaque stratégie live, compare bougie par bougie les signaux (candidats) calculés de deux façons :
//   - BACKTEST : sur l'historique COMPLET de bougies finies (ce que voient warmUp(), runCleanStudy.js et toutes les études) ;
//   - LIVE     : comme cTraderDataSource._ingestNewLiveBar - à la première cotation de la bougie k, avec l'historique retenu
//                par le live (WINDOW bougies finies avant k, 8640 = 90 jours au démarrage) + la bougie k réduite à son
//                ouverture (high = low = close = open).
// Un signal présent d'un seul côté est un écart : soit le live rate un signal (bug live), soit le backtest utilise une
// information que le live ne peut pas avoir (bug d'étude). Mêmes niveaux (stop/objectif) comparés aussi.
//
// Usage : node --max-old-space-size=6144 scripts/checkLiveVsBacktestSignals.js [début=2023-06-01] [fin=2026-09-21] [WINDOW=8640]
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';
import { OFF, loadM1, toM15 } from './lib/m1Data.js';

const FROM = Date.parse(process.argv[2] || '2023-06-01') - OFF;
const TO = Date.parse(process.argv[3] || '2026-09-21') - OFF;
const WINDOW = Number(process.argv[4] || 8640);

const engine = new LiveStrategyEngine({
  symbols: ['US100', 'US500'], fvgConfig: {}, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog,
  weeklySweepConfig: CONFIG.weeklySweep, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr,
  guardrail: new GuardrailEngine({ ...CONFIG.guardrails }), riskPctPerTrade: 0.3,
});
const bars = {};
for (const s of ['US100', 'US500']) bars[s] = toM15(loadM1('broker', s)).map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));

const LEGS = [
  ['nwog', 'US100', (h) => engine._computeNwogCandidates(h)],
  ['weeklysweep', 'US500', (h) => engine._computeWeeklySweepCandidates(h)],
  ['silverbullet', 'US100', (h) => engine._computeSilverBulletCandidates(h)],
  ['silverbullet', 'US500', (h) => engine._computeSilverBulletCandidates(h)],
  ['cbdr', 'US100', (h) => engine._computeCbdrCandidates(h)],
];
const key = (c) => JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k]) => typeof c[k] !== 'object').sort()));
const iso = (t) => new Date(t + OFF).toISOString().slice(0, 16);

function compare(label, fullCands, liveAt) {
  const inRange = (t) => t >= FROM && t < TO;
  const full = new Map(fullCands.filter((c) => inRange(c.entryTime)).map((c) => [`${c.symbol ?? ''}|${c.entryTime}`, c]));
  const live = new Map(liveAt.map((c) => [`${c.symbol ?? ''}|${c.entryTime}`, c]));
  const onlyFull = [...full.keys()].filter((k) => !live.has(k));
  const onlyLive = [...live.keys()].filter((k) => !full.has(k));
  const diffLevels = [...full.keys()].filter((k) => live.has(k) && key(full.get(k)) !== key(live.get(k)));
  console.log(`\n${label} : backtest ${full.size}, live ${live.size} | seulement backtest ${onlyFull.length}, seulement live ${onlyLive.length}, niveaux différents ${diffLevels.length}`);
  const show = (arr, tag, m) => arr.slice(0, 6).forEach((k) => console.log(`   ${tag} ${iso(Number(k.split('|')[1]))} ${key(m.get(k))}`));
  show(onlyFull, 'BACKTEST SEUL', full); show(onlyLive, 'LIVE SEUL    ', live);
  diffLevels.slice(0, 4).forEach((k) => console.log(`   NIVEAUX ${iso(Number(k.split('|')[1]))}\n     backtest ${key(full.get(k))}\n     live     ${key(live.get(k))}`));
}

for (const [src, sym, fn] of LEGS) {
  const B = bars[sym];
  const t0 = Date.now();
  const fullCands = fn(B);
  const liveAt = [];
  for (let k = 0; k < B.length; k++) {
    if (B[k].time < FROM || B[k].time >= TO) continue;
    const stub = { time: B[k].time, open: B[k].open, high: B[k].open, low: B[k].open, close: B[k].open };
    const hist = [...B.slice(Math.max(0, k - WINDOW), k), stub];
    for (const c of fn(hist)) if (c.entryTime === B[k].time) liveAt.push(c);
  }
  compare(`${src} ${sym} (${((Date.now() - t0) / 1000).toFixed(0)} s)`, fullCands, liveAt);
}

// Divergence : les deux jambes ont leur bougie k (réduite à l'ouverture) quand la seconde arrive (voir _detectDivergenceSignal).
{
  const [A, Bs] = CONFIG.divergence.pair;
  const ta = bars[A], tb = bars[Bs];
  const idxB = new Map(tb.map((c, i) => [c.time, i]));
  const fullCands = engine._computeDivergenceCandidates(ta, tb, A, Bs);
  const liveAt = [];
  for (let k = 0; k < ta.length; k++) {
    const t = ta[k].time; if (t < FROM || t >= TO) continue;
    const j = idxB.get(t); if (j === undefined) continue;
    const stubA = { ...ta[k], high: ta[k].open, low: ta[k].open, close: ta[k].open };
    const stubB = { ...tb[j], high: tb[j].open, low: tb[j].open, close: tb[j].open };
    const cands = engine._computeDivergenceCandidates([...ta.slice(Math.max(0, k - WINDOW), k), stubA], [...tb.slice(Math.max(0, j - WINDOW), j), stubB], A, Bs);
    for (const c of cands) if (c.entryTime === t) liveAt.push(c);
  }
  compare('divergence US100/US500', fullCands, liveAt);
}
