#!/usr/bin/env node
// runNightQuantExplore.js - recherche de nuit, famille D (pistes quantitatives), EXPLORATION 2011-2018 seulement :
//   D1 « limite au creux » (retour à la moyenne intrajournalier, amendement 1), D2 écart d'ouverture de 9 h 30, D3 jour de la semaine.
// Sélection (pré-enregistrement + amendement 1) : retenue = >= 60 trades, R moyen > 0, t >= 2, deux moitiés positives ; au plus 2 par
// piste (2e place : autre fenêtre ou autre marché) ; D1 : réglages voisins (d et objectif à un cran) tous positifs.
// Usage : node --max-old-space-size=12000 scripts/runNightQuantExplore.js  -> data/backtest-input/night-explore-quant.{md,json}
import fs from 'node:fs';
import { loadPhase, PHASES, spreadAt, swapCost, exploreVerdict, sgn, inBlocks } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { dipTrades, cashSessions, gapTrades, weekdayTrades } from './lib/dipRule.js';
import { D1_WINDOWS, D1_DS, D1_RRS, D1_DIRS, D1_EXECS } from './lib/nightQuantGrid.js';

const SYMS = ['US100', 'US500', 'XAUUSD', 'EURUSD'];
const res = [];
const keep = (tr) => tr.filter((t) => inBlocks(t.entryTime, PHASES.explore.count));
const push = (base, tr) => { const v = exploreVerdict(keep(tr)); res.push({ ...base, n: v.all.n, mean: v.all.mean, sum: v.all.sum, t: v.all.t, win: v.all.win, pf: v.all.pf, maxDD: v.all.maxDD, h1: v.halves[0].sum, h2: v.halves[1].sum, retained: v.retained }); };
const t0 = Date.now();
for (const sym of SYMS) {
  const S = loadPhase(sym, 'explore'), X = buildContext(S);
  const costs = { spreadAt: (p) => spreadAt(sym, p), swap: swapCost(sym) };
  for (const [wl, W] of Object.entries(D1_WINDOWS)) for (const d of D1_DS) for (const rr of D1_RRS) for (const [dl, dirs] of Object.entries(D1_DIRS)) for (const exec of D1_EXECS) {
    push({ piste: 'D1', sym, window: wl, d, rr, dirs: dl, exec }, dipTrades(X, { ...W, d, rr, dirs, exec, ...costs }));
  }
  if (sym === 'US100' || sym === 'US500') {
    const sess = cashSessions(S);
    for (const g of [0.5, 1, 2]) for (const exitMin of [660, 960]) for (const [dl, dirs] of [['les deux', [1, -1]], ['achat (écarts baissiers)', [1]]]) push({ piste: 'D2', sym, window: `écart >= ${g} ATR, sortie ${exitMin === 660 ? '11h' : '16h'}`, dirs: dl, g, exitMin }, gapTrades(X, sess, { g, exitMin, dirs, ...costs }));
    for (const dow of [1, 2, 3, 4, 5]) for (const dir of [1, -1]) push({ piste: 'D3', sym, window: `jour ${dow}`, dirs: dir > 0 ? 'achat' : 'vente', dow, dir }, weekdayTrades(X, sess, { dow, dir, ...costs }));
  }
  console.log(`${sym} : ${res.filter((r) => r.sym === sym).length} variantes (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
// sélection
const same = (a, b, keys) => keys.every((k) => a[k] === b[k]);
function neighborsOk(r) {
  if (r.piste === 'D2') {
    const gs = [0.5, 1, 2], gi = gs.indexOf(r.g);
    const nb = res.filter((x) => x.piste === 'D2' && x.sym === r.sym && x.dirs === r.dirs && ((x.exitMin === r.exitMin && Math.abs(gs.indexOf(x.g) - gi) === 1) || (x.g === r.g && x.exitMin !== r.exitMin)));
    r.neighbors = nb.map((x) => `écart ${x.g} / sortie ${x.exitMin / 60}h : ${sgn(x.mean, 3)}`).join(' ; ');
    return nb.length > 0 && nb.every((x) => x.mean > 0);
  }
  if (r.piste !== 'D1') return true;
  const di = D1_DS.indexOf(r.d), ri = D1_RRS.indexOf(r.rr);
  const nb = res.filter((x) => x.piste === 'D1' && same(x, r, ['sym', 'window', 'dirs', 'exec']) && ((x.rr === r.rr && Math.abs(D1_DS.indexOf(x.d) - di) === 1) || (x.d === r.d && Math.abs(D1_RRS.indexOf(x.rr) - ri) === 1)));
  r.neighbors = nb.map((x) => `d ${x.d} / ${x.rr}R : ${sgn(x.mean, 3)}`).join(' ; ');
  return nb.length > 0 && nb.every((x) => x.mean > 0);
}
const selected = {};
for (const p of ['D1', 'D2', 'D3']) {
  const el = res.filter((r) => r.piste === p && r.retained && neighborsOk(r)).sort((a, b) => b.t - a.t);
  // « autre règle » (amendement 1) : autre fenêtre horaire (D1), autre jour (D3) ou autre marché ; pour D2 le seuil d'écart et l'heure de
  // sortie sont des réglages de la même règle, seule un autre marché compte
  const ruleKey = (r) => (r.piste === 'D2' ? 'écart' : r.window);
  const first = el[0], second = first && el.find((r) => ruleKey(r) !== ruleKey(first) || r.sym !== first.sym);
  selected[p] = [first, second].filter(Boolean);
}
fs.writeFileSync('data/backtest-input/night-explore-quant.json', JSON.stringify({ res, selected }));
const lab = (r) => r.piste === 'D1' ? `${r.window}, limite à ${r.d} ATR, ${r.rr}R, ${r.dirs}, ${r.exec === 'limit' ? 'rempli au niveau' : 'au marché après le toucher'}` : `${r.window}, ${r.dirs}`;
const row = (r) => `| ${r.piste} | ${r.sym} | ${lab(r)} | ${r.n} | ${Math.round(100 * r.win)} % | ${sgn(r.mean, 3)} | ${sgn(r.sum)} | ${r.t.toFixed(2)} | ${sgn(r.h1)} / ${sgn(r.h2)} | ${r.pf.toFixed(2)} | ${r.maxDD.toFixed(1)} |`;
const head = '| Piste | Marché | Règle | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R |\n|---|---|---|---|---|---|---|---|---|---|---|';
const md = ['# Recherche de nuit — exploration 2011-2018, famille D (pistes quantitatives)', '',
  `Pré-enregistrement \`preregistration-nuit-2026-09-26.md\` (+ amendement 1). Script \`scripts/runNightQuantExplore.js\`, règles \`scripts/lib/dipRule.js\`. ${res.length} variantes. R net du spread du projet et du swap.`, '',
  '## Sélection (figée pour la validation)', '',
  ...['D1', 'D2', 'D3'].flatMap((p) => [`**${p}** : ${selected[p].length ? '' : 'aucune variante retenue.'}`, ...selected[p].map((r, q) => `${q + 1}. ${r.sym} — ${lab(r)} (${r.n} trades, ${sgn(r.mean, 3)} R/trade, t ${r.t.toFixed(2)} ; voisins : ${r.neighbors || '—'})`), '']),
  ...['D1', 'D2', 'D3'].flatMap((p) => { const a = res.filter((r) => r.piste === p); return [`## ${p} : ${a.length} variantes, retenues ${a.filter((r) => r.retained).length}, t ≥ 2 : ${a.filter((r) => r.t >= 2).length}, t ≤ −2 : ${a.filter((r) => r.t <= -2).length}`, '', head, ...[...a].sort((x, y) => y.t - x.t).slice(0, p === 'D1' ? 40 : 12).map(row), '']; }),
];
fs.writeFileSync('data/backtest-input/night-explore-quant.md', md.join('\n') + '\n');
console.log(md.slice(0, 14).join('\n'));
