#!/usr/bin/env node
// runRiskBrakeFtmoStudy.js
// Usage : node scripts/runRiskBrakeFtmoStudy.js      (il faut data/live-replay/*.json, voir runLiveReplay.js)
//
// Frein de risque contre risque fixe pour les challenges FTMO 1-Step, sur les trades du combo live au rejeu fidèle, EXACTEMENT tel
// que pré-enregistré dans data/backtest-input/preregistration-risk-brake-ftmo-2026-09-24.md (commité AVANT ce script).
// Rapport : data/backtest-input/risk-brake-ftmo-study.md.
import fs from 'node:fs';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';
import { OFF } from './lib/m1Data.js';

const START = 10000;
const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['train', 'Entraînement 2010-2022', Y(2010), Y(2023)], ['test', 'Test 2023-2025', Y(2023), Y(2026)], ['fwd', '2026 (→ 21 sept.)', Y(2026), Y(2027)]];
const CONFIGS = [
  ...[0.25, 0.3, 0.5, 0.75, 1].map((r) => ({ id: `fixe ${r} %`, base: r, brakeAt: null })),
  ...[[0.5, 4], [0.5, 5], [0.75, 4], [0.75, 5]].map(([r, d]) => ({ id: `frein ${r} % → ${r / 2} % à −${d} %`, base: r, brakeAt: d })),
];

function run(trades, cfg) {
  const evs = [];
  trades.forEach((t, i) => { evs.push({ time: t.entry, kind: 1, i }); evs.push({ time: Math.max(t.exit, t.entry), kind: 0, i }); });
  evs.sort((a, b) => a.time - b.time || b.kind - a.kind);
  const guard = buildEffectiveConfig({ id: 'brake', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: cfg.base }).guardrails;
  const cycles = []; let c = null;
  const start = (time) => { const g = new GuardrailEngine({ ...guard }); g.setBalance(START, time); c = { start: time, g, bal: START, peak: START, open: new Map(), n: 0 }; };
  start(evs.length ? evs[0].time : 0);
  for (const ev of evs) {
    const t = trades[ev.i];
    if (ev.kind === 1) {
      if (t.entry < c.start || !c.g.canTakeNewTrade(t.entry, t.symbol)) continue;
      const dd = (c.peak - c.bal) / c.peak * 100;
      const risk = cfg.brakeAt !== null && dd >= cfg.brakeAt ? cfg.base / 2 : cfg.base;
      c.open.set(ev.i, c.bal * risk / 100);
      continue;
    }
    if (!c.open.has(ev.i)) continue;
    const pnl = c.open.get(ev.i) * t.r; c.open.delete(ev.i);
    c.bal += pnl; c.n++; c.peak = Math.max(c.peak, c.bal);
    c.g.recordTrade({ pnl, time: t.exit, balanceAfter: c.bal, symbol: t.symbol });
    const st = c.g.getStatus(t.exit, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) { cycles.push({ start: c.start, end: t.exit, out: st.targetReached ? 'ok' : 'ko' }); start(t.exit); }
  }
  const ok = cycles.filter((x) => x.out === 'ok'), ko = cycles.filter((x) => x.out === 'ko');
  const days = ok.map((x) => (x.end - x.start) / 86400000).sort((a, b) => a - b);
  return { ok: ok.length, ko: ko.length, med: days.length ? days[days.length >> 1] : null, cur: (c.bal - START) / START * 100 };
}

function main() {
  const all = fs.readdirSync('data/live-replay').flatMap((f) => JSON.parse(fs.readFileSync(`data/live-replay/${f}`, 'utf8')).trades)
    .map((t) => ({ symbol: t.symbol, entry: t.entryTime + OFF, exit: t.exitTime + OFF, r: t.r })).sort((a, b) => a.entry - b.entry);
  const md = ['# Frein de risque contre risque fixe, challenges FTMO 1-Step, combo live — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-risk-brake-ftmo-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runRiskBrakeFtmoStudy.js`. Trades du combo live au rejeu fidèle 2010-2026 ; seule la taille change. Cycles FTMO 1-Step enchaînés (garde-fou FTMO du projet).', '',
    '| Configuration | Entraînement 2010-2022 : réussis / ratés (réussis − ratés) | Durée médiane d\'un réussi | Test 2023-2025 : réussis / ratés | 2026 : réussis / ratés (cycle en cours) |', '|---|---|---|---|---|'];
  const res = CONFIGS.map((cfg) => {
    const r = PERIODS.map(([, , a, b]) => run(all.filter((t) => t.entry >= a && t.entry < b), cfg));
    md.push(`| ${cfg.id} | ${r[0].ok} / ${r[0].ko} (${r[0].ok - r[0].ko >= 0 ? '+' : ''}${r[0].ok - r[0].ko}) | ${r[0].med !== null ? Math.round(r[0].med) + ' j' : '—'} | ${r[1].ok} / ${r[1].ko} | ${r[2].ok} / ${r[2].ko} (${r[2].cur >= 0 ? '+' : ''}${r[2].cur.toFixed(1)} %) |`);
    return { cfg, r };
  });
  const score = (x) => [x.r[0].ok - x.r[0].ko, -x.r[0].ko];
  const better = (a, b) => { const [s1, t1] = score(a), [s2, t2] = score(b); return s1 > s2 || (s1 === s2 && t1 > t2); };
  const bestFixed = res.filter((x) => x.cfg.brakeAt === null).reduce((a, b) => (better(b, a) ? b : a));
  const bestAll = res.reduce((a, b) => (better(b, a) ? b : a));
  const brakeWins = bestAll.cfg.brakeAt !== null && better(bestAll, bestFixed);
  md.push('', '## Choix sur l\'entraînement (réussis − ratés, à égalité le moins de ratés)', '',
    `- Meilleur risque fixe : **${bestFixed.cfg.id}** (${bestFixed.r[0].ok} / ${bestFixed.r[0].ko}).`,
    `- Meilleure configuration au total : **${bestAll.cfg.id}**.`,
    `- Verdict : ${brakeWins ? '**le frein est RETENU** (il bat le meilleur risque fixe)' : '**le frein n\'est PAS retenu** (il ne bat pas le meilleur risque fixe)'}.`,
    `- Configuration choisie, lue une fois : test 2023-2025 ${bestAll.r[1].ok} réussis / ${bestAll.r[1].ko} ratés ; 2026 ${bestAll.r[2].ok} / ${bestAll.r[2].ko} (cycle en cours ${bestAll.r[2].cur >= 0 ? '+' : ''}${bestAll.r[2].cur.toFixed(1)} %).`,
    '', '## Limites', '', '- 1 réussi compte autant que 1 raté (coût d\'un échec FTMO non chiffré).', '- Trades fixes du rejeu (garde-fou appliqué au rejeu à 0,3 %) ; tranches recollées.');
  fs.writeFileSync('data/backtest-input/risk-brake-ftmo-study.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
