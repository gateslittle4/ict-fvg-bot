#!/usr/bin/env node
// runFvgGaucheStudy.js - test pré-enregistré data/backtest-input/preregistration-fvg-a-gauche-2026-09-29.md : FVG « 15 min » vers FVG « à
// gauche » (stratégie d'Esdras), US100 + US500. Règles dans scripts/lib/fvgGauche.js (testées) ; règlement minute par minute par `manage`
// de scripts/lib/stopOrderEntry.js (stop d'abord, trou à l'ouverture, sortie à 5 jours).
// Deux temps, comme le pré-enregistrement :
//   node scripts/runFvgGaucheStudy.js train   -> entraînement 2010-2022 seulement (HistData) -> data/backtest-input/fvg-a-gauche-study-train.md
//   node scripts/runFvgGaucheStudy.js test    -> test 2023-2025 (lu UNE fois) et 2026 (descriptif) ; refusé si l'entraînement n'a pas réussi
import fs from 'node:fs';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { eng, loadM1, toM15, refPrice, swapPerUnit } from './lib/m1Data.js';
import { runSymbol, stats, trainVerdict } from './lib/fvgGauche.js';

const STAGE = process.argv[2];
if (!['train', 'test'].includes(STAGE)) { console.error('Usage: node scripts/runFvgGaucheStudy.js <train|test>'); process.exit(1); }
const TRAIN_MD = 'data/backtest-input/fvg-a-gauche-study-train.md';
const TEST_MD = 'data/backtest-input/fvg-a-gauche-study-test.md';
if (STAGE === 'test') {
  if (!fs.existsSync(TRAIN_MD) || !fs.readFileSync(TRAIN_MD, 'utf8').includes('ENTRAÎNEMENT VALIDÉ')) {
    console.error('Refusé : le test 2023-2025 ne se lit que si l\'entraînement a réussi (pré-enregistrement, temps 2).'); process.exit(1);
  }
  if (fs.existsSync(TEST_MD)) { console.error('Refusé : le test 2023-2025 a déjà été lu une fois.'); process.exit(1); }
}

const SYMS = ['US100', 'US500'];
const RANGE = STAGE === 'train' ? [eng(2010), eng(2023)] : [eng(2023), eng(2027)];
const t0 = Date.now();
const all = []; const perSym = {}; const counters = {};
for (const sym of SYMS) {
  const S = loadM1(STAGE === 'train' ? 'hist' : 'broker', sym);
  const ref = refPrice(sym);
  const { trades, counters: c } = runSymbol(S, toM15(S), {
    from: RANGE[0], to: RANGE[1],
    spreadAt: (price) => (DEFAULT_SPREADS[sym] ?? 0) * (price / ref),
    swapFor: (dir, a, b, fill) => swapPerUnit(sym, dir, a, b) * (fill / ref),
  });
  perSym[sym] = trades; counters[sym] = c;
  for (const t of trades) all.push({ ...t, sym });
  console.log(`${sym} : ${trades.length} trades (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const row = (lab, list, key = 'r') => { const s = stats(list.map((t) => t[key])); return `| ${lab} | ${s.n} | ${Math.round(100 * s.win)} % | ${sgn(s.mean, 3)} | ${sgn(s.sum)} | ${s.t.toFixed(2)} |`; };
const inR = (a, b) => (t) => t.time >= a && t.time < b;
const HEAD = ['| Période | Trades | Gagnants | R moyen | R total | t |', '|---|---|---|---|---|---|'];
const md = [`# FVG « 15 min » vers FVG « à gauche » — ${STAGE === 'train' ? 'entraînement 2010-2022' : 'test 2023-2025 et 2026'}`, '',
  `Règles : \`data/backtest-input/preregistration-fvg-a-gauche-2026-09-29.md\` (commité avant ce calcul). Script : \`scripts/runFvgGaucheStudy.js ${STAGE}\`. R net de spread et de swap (commission 0), rapporté au risque réel. Généré le ${new Date().toISOString().slice(0, 16)} UTC.`, ''];
let verdictLine;
if (STAGE === 'train') {
  const h1 = all.filter(inR(eng(2010), eng(2017))), h2 = all.filter(inR(eng(2017), eng(2023)));
  const v = trainVerdict({ pooled: stats(all.map((t) => t.r)), h1: stats(h1.map((t) => t.r)), h2: stats(h2.map((t) => t.r)) });
  md.push('## US100 + US500 (verdict)', '', ...HEAD, row('Entraînement 2010-2022', all), row('  dont 2010-2016', h1), row('  dont 2017-2022', h2), '');
  for (const sym of SYMS) {
    const L = all.filter((t) => t.sym === sym);
    md.push(`## ${sym} (descriptif)`, '', ...HEAD, row('Entraînement 2010-2022', L), row('  dont 2010-2016', L.filter(inR(eng(2010), eng(2017)))), row('  dont 2017-2022', L.filter(inR(eng(2017), eng(2023)))), '');
  }
  md.push('## Contrôle (descriptif) : mêmes ordres, cible fixe à 3 R au lieu du FVG « à gauche »', '', ...HEAD, row('Cible « à gauche »', all), row('Cible fixe 3 R', all, 'rControl'), '');
  verdictLine = v.status === 'VALIDÉ'
    ? `**ENTRAÎNEMENT VALIDÉ** (${v.text}). Le test 2023-2025 peut être lu, une seule fois : \`node scripts/runFvgGaucheStudy.js test\`.`
    : v.status === 'NON CONCLUANT'
      ? `**ENTRAÎNEMENT NON CONCLUANT** (${v.text}). Le test n'est pas lu.`
      : `**ENTRAÎNEMENT ÉCHEC** (${v.text}). Le test 2023-2025 et 2026 ne sont pas lus.`;
} else {
  const test = all.filter(inR(eng(2023), eng(2026))), fwd = all.filter(inR(eng(2026), eng(2027)));
  const s = stats(test.map((t) => t.r));
  md.push('## US100 + US500', '', ...HEAD, row('Test 2023-2025', test), row('Forward 2026 (descriptif)', fwd), '');
  for (const sym of SYMS) { const L = all.filter((t) => t.sym === sym); md.push(`## ${sym} (descriptif)`, '', ...HEAD, row('Test 2023-2025', L.filter(inR(eng(2023), eng(2026)))), row('Forward 2026', L.filter(inR(eng(2026), eng(2027)))), ''); }
  verdictLine = s.mean > 0 ? `**CANDIDAT** (test ${sgn(s.mean, 3)} R/trade sur ${s.n} trades) — démo seulement avant tout réel, décision d'Esdras.` : `**ÉCHEC au test** (${sgn(s.mean, 3)} R/trade sur ${s.n} trades).`;
}
md.push('## Comptage des déclencheurs', '', '| Paire | Déclencheurs | Hors fenêtre | Occupé | Sans cible | Cible < 2 R | Ordres | Remplis | Cible avant remplissage | Stop franchi | Expirés |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const sym of SYMS) { const c = counters[sym]; md.push(`| ${sym} | ${c.triggers} | ${c.hors_fenetre} | ${c.occupe} | ${c.sans_cible} | ${c.rr_trop_petit} | ${c.ordres} | ${c.remplis} | ${c['target-first'] || 0} | ${c['stop-crossed'] || 0} | ${c.expired || 0} |`); }
md.push('', '## Verdict (fixé à l\'avance)', '', verdictLine, '');
fs.writeFileSync(STAGE === 'train' ? TRAIN_MD : TEST_MD, md.join('\n') + '\n');
console.log(md.join('\n'));
