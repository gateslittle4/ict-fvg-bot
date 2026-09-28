#!/usr/bin/env node
// runWeekendCloseStudy.js - test pré-enregistré dans data/backtest-input/preregistration-weekend-close-2026-09-25.md.
// Prérequis : les 8 tranches avec WEEKEND_CLOSE=1 NO_AB=1 (data/live-replay/<tranche>-weekendclose.json).
// Usage : node scripts/runWeekendCloseStudy.js   -> data/backtest-input/weekend-close-study.md
import fs from 'node:fs';
import { OFF } from './lib/m1Data.js';
import { challengeOutcome, weeklyStarts } from './lib/ftmoChallenge.js';

const Y = (y) => Date.UTC(y, 0, 1);
const TRANCHES = ['hist-2010-2014', 'hist-2014-2017', 'hist-2017-2020', 'hist-2020-2023', 'broker-2023-2024', 'broker-2024-2025', 'broker-2025-2026', 'broker-2026-2027'];
const load = (suffix) => TRANCHES.flatMap((f) => JSON.parse(fs.readFileSync(`data/live-replay/${f}${suffix}.json`, 'utf8')).trades)
  .map((t) => ({ ...t, u: t.entryTime + OFF, x: t.exitTime + OFF })).sort((a, b) => a.x - b.x);
const V = { sans: load(''), avec: load('-weekendclose') };
const END = Math.max(...Object.values(V).map((l) => l[l.length - 1].x));
const P = [['2011-2016', Y(2011), Y(2017)], ['2017-2022', Y(2017), Y(2023)], ['Test 2023-2025', Y(2023), Y(2026)], ['2026 (→ 21/09)', Y(2026), Y(2027)]];
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const pct = (a, n) => `${n ? Math.round((100 * a) / n) : 0} %`;

function ftmo(list, a, b) {
  const R = weeklyStarts(a, b, END).map((s) => challengeOutcome(list, s, { riskPct: 0.5, end: END }));
  const c = (k) => R.filter((r) => r.res === k).length;
  const pd = R.filter((r) => r.res === 'pass').map((r) => r.days).sort((x, y) => x - y);
  return { n: R.length, pass: c('pass'), bust: c('bust') + c('bust-day'), open: c('open'), med: pd.length ? pd[Math.floor(pd.length / 2)] : NaN };
}
function risk(list, a, b) {
  const l = list.filter((t) => t.u >= a && t.u < b);
  const days = new Map();
  for (const t of l) { const d = new Date(t.x + 3600000).toISOString().slice(0, 10); days.set(d, (days.get(d) || 0) + t.r); }
  return { n: l.length, s: l.reduce((z, t) => z + t.r, 0), worst: Math.min(...l.map((t) => t.r)), worstDay: Math.min(...days.values()) };
}

const md = ['# Fermer les positions intraday avant le week-end — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-weekend-close-2026-09-25.md` (commité avant ce calcul). Rejeu fidèle `WEEKEND_CLOSE=1 NO_AB=1` sur les 8 tranches, comparé aux tranches existantes. Scripts : `scripts/runWeekendCloseStudy.js`, `scripts/lib/ftmoChallenge.js`, `scripts/lib/weekendClose.js`.', '',
  '## Challenge FTMO 1-Step (départ chaque lundi, 0,5 % par trade)', '',
  '| Départs | Nombre | Réussis sans règle | Réussis avec règle | Bustés sans / avec | Durée médiane sans / avec |', '|---|---|---|---|---|---|'];
const res = {};
for (const [lab, a, b] of P) {
  const s = ftmo(V.sans, a, b), v = ftmo(V.avec, a, b);
  res[lab] = { s, v };
  md.push(`| ${lab} | ${s.n} | ${pct(s.pass, s.n)} (${s.pass}) | ${pct(v.pass, v.n)} (${v.pass}) | ${pct(s.bust, s.n)} / ${pct(v.bust, v.n)} | ${s.med.toFixed(0)} j / ${v.med.toFixed(0)} j |`);
}
md.push('', '## Descriptif : R et pertes extrêmes (trades entrés dans la période)', '', '| Période | R total sans / avec | Trades sans / avec | Pire trade sans / avec | Pire jour sans / avec |', '|---|---|---|---|---|');
for (const [lab, a, b] of P) {
  const s = risk(V.sans, a, b), v = risk(V.avec, a, b);
  md.push(`| ${lab} | ${sgn(s.s)} / ${sgn(v.s)} R | ${s.n} / ${v.n} | ${sgn(s.worst)} / ${sgn(v.worst)} R | ${sgn(s.worstDay)} / ${sgn(v.worstDay)} R |`);
}
const wk = V.avec.filter((t) => t.reason === 'weekend');
md.push('', `Fermetures du vendredi : ${wk.length} trades, ${sgn(wk.reduce((z, t) => z + t.r, 0))} R au moment de la fermeture.`, '');
md.push('| Stratégie | Fermés le vendredi | R sans règle (toutes périodes) | R avec règle |', '|---|---|---|---|');
for (const leg of [...new Set(V.sans.map((t) => `${t.source} ${t.symbol}`))].sort()) {
  const f = (l) => l.filter((t) => `${t.source} ${t.symbol}` === leg && t.u >= Y(2011));
  md.push(`| ${leg} | ${wk.filter((t) => `${t.source} ${t.symbol}` === leg).length} | ${sgn(f(V.sans).reduce((z, t) => z + t.r, 0))} | ${sgn(f(V.avec).reduce((z, t) => z + t.r, 0))} |`);
}
const ok = (k) => res[k].v.pass / res[k].v.n >= res[k].s.pass / res[k].s.n;
const verdict = !(ok('2011-2016') && ok('2017-2022')) ? '**NON RETENU** (le taux de réussite baisse sur au moins une moitié de l\'entraînement)'
  : ok('Test 2023-2025') ? '**RETENU** (changement du bot à décider par Esdras : fermeture le vendredi 16:45 New York des positions du combo, sauf RSI(2))'
    : '**NON RETENU** (le taux de réussite baisse au test 2023-2025)';
md.push('', '## Verdict (critère pré-enregistré)', '', verdict, '', '## Limites', '', '- Vendredi saint et fermetures anticipées non traités.', '- A et B non incluses (tranches sans A/B) ; elles ferment déjà le soir même.', '- Jour FTMO approché par UTC + 1 h ; soldes réalisés (pas de perte latente en cours de trade).');
fs.writeFileSync('data/backtest-input/weekend-close-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
