#!/usr/bin/env node
// runFtmoWorstCaseCheck.js - critique externe (Gemini, 25/09/2026) : la simulation FTMO ne comptait que le solde réalisé, alors que FTMO
// mesure l'équité. Ici, pire cas : chaque position ouverte compte à son stop (min(-1, r) R) de son entrée à sa sortie.
// Usage : node scripts/runFtmoWorstCaseCheck.js   -> data/backtest-input/ftmo-worst-case-check.md
import fs from 'node:fs';
import { OFF } from './lib/m1Data.js';
import { challengeOutcome, weeklyStarts } from './lib/ftmoChallenge.js';

const Y = (y) => Date.UTC(y, 0, 1);
const TR = ['hist-2010-2014', 'hist-2014-2017', 'hist-2017-2020', 'hist-2020-2023', 'broker-2023-2024', 'broker-2024-2025', 'broker-2025-2026', 'broker-2026-2027'];
const load = (dir) => TR.flatMap((f) => JSON.parse(fs.readFileSync(`data/live-replay/${dir}${f}.json`, 'utf8')).trades).map((t) => ({ ...t, u: t.entryTime + OFF, x: t.exitTime + OFF })).sort((a, b) => a.x - b.x);
// Bot complet (A et B comprises, pire perte latente mesurée minute par minute) : data/live-replay/ab/, faits par runLiveReplay.js sans NO_AB.
const SETS = [['Bot complet (combo + A + B), rejeu fidèle', load('ab/'), ['realized', 'mae', 'stop']]];
if (process.argv.includes('--combo')) SETS.push(['Combo seul (tranches sans A/B)', load(''), ['realized', 'stop']]);
const P = [['2011-2016', Y(2011), Y(2017)], ['2017-2022', Y(2017), Y(2023)], ['2023-2025', Y(2023), Y(2026)], ['2026 (→ 21/09)', Y(2026), Y(2027)], ['Tout 2011-2026', Y(2011), Y(2027)]];
const pct = (a, n) => `${Math.round((100 * a) / n)} %`;
const NAMES = { realized: 'solde réalisé', mae: 'pire perte réelle', stop: 'tout au stop' };
function run(trades, end, a, b, risk, open) {
  const R = weeklyStarts(a, b, end).map((s) => challengeOutcome(trades, s, { riskPct: risk, end, open }));
  const c = (k) => R.filter((r) => r.res === k).length;
  const pd = R.filter((r) => r.res === 'pass').map((r) => r.days).sort((x, y) => x - y);
  return { n: R.length, pass: c('pass'), bust: c('bust'), day: c('bust-day'), med: pd.length ? pd[Math.floor(pd.length / 2)] : NaN };
}
const md = ['# Challenge FTMO : pertes latentes comprises', '',
  'Critique externe (Gemini, 25/09/2026) : FTMO mesure l\'équité (positions ouvertes comprises), la simulation ne comptait que le solde réalisé. Trois mesures : **solde réalisé** (l\'ancienne) ; **pire perte réelle** : chaque position compte, de son entrée à sa sortie, pour la pire perte qu\'elle a vraiment atteinte (mesurée minute par minute au rejeu) - encore prudent, puisque toutes les pires pertes sont supposées en même temps ; **tout au stop** : pire cas, chaque position ouverte à −1 R. Départ chaque lundi. Script : `scripts/runFtmoWorstCaseCheck.js`.', ''];
for (const [label, trades, modes] of SETS) {
  const end = trades[trades.length - 1].x;
  const ev = trades.flatMap((t) => [[t.u, 1], [t.x, -1]]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  let o = 0, mx = 0; const hist = {}; let last = ev[0][0];
  for (const [t, d] of ev) { hist[o] = (hist[o] || 0) + (t - last); last = t; o += d; mx = Math.max(mx, o); }
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  md.push(`## ${label}`, '', `${trades.length} trades. Positions ouvertes en même temps : au plus ${mx} ; part du temps avec 0 / 1 / 2 / 3+ : ${[0, 1, 2].map((k) => pct(hist[k] || 0, total)).join(' / ')} / ${pct(Object.entries(hist).filter(([k]) => k >= 3).reduce((a, [, v]) => a + v, 0), total)}.`, '');
  for (const risk of [0.5, 0.4, 0.3]) {
    md.push(`### Risque ${risk} % par trade (cible et perte max ${Math.round(10 / risk)} R, perte du jour ${3 / risk} R)`, '', `| Départs | Nombre | Réussis : ${modes.map((m) => NAMES[m]).join(' / ')} | Bustés (perte max + jour) | Durée médiane des réussites |`, '|---|---|---|---|---|');
    for (const [lab, a, b] of P) {
      const r = modes.map((m) => run(trades, end, a, b, risk, m));
      md.push(`| ${lab} | ${r[0].n} | ${r.map((x) => pct(x.pass, x.n)).join(' / ')} | ${r.map((x) => pct(x.bust + x.day, x.n)).join(' / ')} | ${r.map((x) => `${x.med.toFixed(0)} j`).join(' / ')} |`);
    }
    md.push('');
  }
}
fs.writeFileSync('data/backtest-input/ftmo-worst-case-check.md', md.join('\n') + '\n');
console.log(md.join('\n'));
