#!/usr/bin/env node
// runNightHypothesisStudy.js
// Usage : node scripts/runNightHypothesisStudy.js
//   (d'abord : LIVE_FILL=1 RRS=<RRR de prod> node scripts/runCleanStudy.js legs <jambes> -> data/clean-study-cache-livefill)
//
// Hypothèse d'Esdras « la nuit, le marché est calme et les stratégies marchent mieux », EXACTEMENT telle que pré-enregistrée dans
// data/backtest-input/preregistration-night-hypothesis-2026-09-24.md (commité AVANT ce script) : 19 jambes hors combo live,
// écart nuit (Asie 18:00-02:00 NY) - séance (New York 9:30-16:00) par jambe, combiné en variance inverse.
// Rapport : data/backtest-input/night-hypothesis-study.md.
import fs from 'node:fs';
import { FIXED_EST_TO_UTC_OFFSET_MS as OFF } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { refPrice, swapPerUnit } from './lib/m1Data.js';

const CACHE = 'data/clean-study-cache-livefill';
const LEGS = [
  ['nwog', 5, 'retour', ['US500', 'XAUUSD', 'EURUSD']],
  ['judasSwing', 3, 'retour', ['US100', 'US500', 'XAUUSD', 'EURUSD']],
  ['weeklySweep', 5, 'retour', ['US100', 'XAUUSD', 'EURUSD']],
  ['breakerBlock', 5, 'retour', ['US100', 'US500', 'XAUUSD', 'EURUSD']],
  ['cbdr', 3, 'retour', ['US500', 'XAUUSD', 'EURUSD']],
  ['silverBullet', 3, 'continuation', ['XAUUSD', 'EURUSD']],
];
const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['train', 'Entraînement 2010-2022', Y(2010), Y(2023)], ['test', 'Test 2023-2025', Y(2023), Y(2026)], ['fwd', '2026', Y(2026), Y(2027)]];

const sundayOf = (y, m, nth) => { const d = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - d) % 7) + 7 * (nth - 1); };
function nyHour(utc) {
  const y = new Date(utc).getUTCFullYear();
  const a = Date.UTC(y, 2, sundayOf(y, 2, 2), 7), b = Date.UTC(y, 10, sundayOf(y, 10, 1), 6);
  const l = new Date(utc + (utc >= a && utc < b ? -4 : -5) * 3600000);
  return l.getUTCHours() + l.getUTCMinutes() / 60;
}
const session = (h) => (h >= 18 || h < 2 ? 'nuit' : h < 9.5 ? 'londres' : h < 16 ? 'seance' : 'soir');
const mv = (l) => { const n = l.length, m = n ? l.reduce((a, x) => a + x, 0) / n : 0; const v = n > 1 ? l.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1) : 0; return { n, m, v }; };
const sgn = (x, d = 3) => (x >= 0 ? '+' : '') + x.toFixed(d);

/** R net d'un trade du cache, même calcul que runCleanStudy.js costR (mode « price ») : spread par défaut et swap du broker en % du prix. */
function netR(t) {
  const k = t.price / refPrice(t.symbol);
  const spread = t.spreadIncluded ? 0 : (DEFAULT_SPREADS[t.symbol] ?? 0) * (t.spreadMult ?? 1) * k;
  return t.gross - spread / t.distance + swapPerUnit(t.symbol, t.direction, t.fillTime, t.exitTime) * k / t.distance;
}

function load(key, rr) {
  const out = [];
  for (const src of ['hist', 'broker']) {
    const f = `${CACHE}/${key}-rr${rr}-${src}.json`;
    if (!fs.existsSync(f)) { console.error(`${f} manquant`); process.exit(1); }
    for (const t of JSON.parse(fs.readFileSync(f, 'utf8'))) { const utc = t.entryTime + OFF; out.push({ utc, r: netR(t), s: session(nyHour(utc)) }); }
  }
  return out;
}

function combine(rows) { // rows: {d, se2}
  const w = rows.map((x) => 1 / x.se2); const W = w.reduce((a, b) => a + b, 0);
  const est = rows.reduce((a, x, i) => a + w[i] * x.d, 0) / W; const se = Math.sqrt(1 / W);
  return { est, se, z: est / se };
}

function main() {
  const legs = [];
  for (const [mech, rr, type, syms] of LEGS) for (const sym of syms) legs.push({ id: `${mech}-${sym}`, mech, sym, type, trades: load(`${mech}-${sym}`, rr) });
  const md = ['# Hypothèse « la nuit, les stratégies marchent mieux » — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-night-hypothesis-2026-09-24.md` (commité avant ce calcul). Script : `scripts/runNightHypothesisStudy.js`. 19 jambes hors combo live, exécution réelle du bot (`runCleanStudy.js`, `LIVE_FILL=1`), RRR de production. Nuit = 18:00-02:00 NY, séance = 9:30-16:00 NY, heure d\'entrée.', '',
    '## Par jambe (R moyen par trade, nombre de trades)', '', '| Jambe | Type | Période | Nuit | Londres | Séance NY | 16h-18h | Écart nuit − séance |', '|---|---|---|---|---|---|---|---|'];
  const sel = { train: [], test: [], fwd: [] };
  for (const L of legs) {
    for (const [pid, plab, a, b] of PERIODS) {
      const T = L.trades.filter((t) => t.utc >= a && t.utc < b);
      const by = (s) => mv(T.filter((t) => t.s === s).map((t) => t.r));
      const n = by('nuit'), lo = by('londres'), se = by('seance'), so = by('soir');
      const cell = (x) => (x.n ? `${sgn(x.m)} (${x.n})` : '—');
      const minN = pid === 'train' ? 30 : 10;
      const ok = n.n >= minN && se.n >= minN;
      const d = n.m - se.m, se2 = (n.n > 1 ? n.v / n.n : 0) + (se.n > 1 ? se.v / se.n : 0);
      md.push(`| ${L.id} | ${L.type} | ${plab} | ${cell(n)} | ${cell(lo)} | ${cell(se)} | ${cell(so)} | ${ok ? sgn(d) : '— (pas assez de trades)'} |`);
      if (ok && se2 > 0) sel[pid].push({ id: L.id, type: L.type, d, se2 });
    }
  }
  const trainIds = new Set(sel.train.map((x) => x.id));
  const tr = sel.train.length ? combine(sel.train) : null;
  const pos = sel.train.filter((x) => x.d > 0).length;
  const testRows = sel.test.filter((x) => trainIds.has(x.id));
  const te = testRows.length ? combine(testRows) : null;
  const fwRows = sel.fwd.filter((x) => trainIds.has(x.id));
  const fw = fwRows.length ? combine(fwRows) : null;
  let verdict;
  if (sel.train.length < 3) verdict = '**NON CONCLUANT** (moins de 3 jambes tradent aux deux sessions)';
  else if (tr.z >= 2 && pos / sel.train.length >= 0.6) verdict = te && te.est > 0 ? '**H1 SOUTENUE** (entraînement puis test)' : '**ÉCHEC au test**';
  else verdict = '**H1 NON SOUTENUE à l\'entraînement**';
  md.push('', '## Test principal (H1)', '',
    `- Jambes retenues à l'entraînement (≥ 30 trades de nuit ET de séance) : ${sel.train.length} (${sel.train.map((x) => x.id).join(', ') || 'aucune'}).`,
    tr ? `- Entraînement : écart combiné nuit − séance ${sgn(tr.est)} R/trade (erreur type ${tr.se.toFixed(3)}), **z = ${tr.z.toFixed(2)}** ; écart positif pour ${pos}/${sel.train.length} jambes.` : '- Entraînement : —',
    te ? `- Test 2023-2025 (${testRows.length} jambes avec ≥ 10 trades par session) : écart combiné ${sgn(te.est)} R/trade, z = ${te.z.toFixed(2)}.` : '- Test 2023-2025 : pas de jambe avec assez de trades aux deux sessions.',
    fw ? `- 2026 (descriptif, ${fwRows.length} jambes) : écart combiné ${sgn(fw.est)} R/trade, z = ${fw.z.toFixed(2)}.` : '- 2026 : pas assez de trades.',
    `- Verdict : ${verdict}`);
  md.push('', '## Test secondaire (H2, descriptif) : retour vs continuation, entraînement', '');
  for (const type of ['retour', 'continuation']) {
    const rows = sel.train.filter((x) => x.type === type);
    md.push(rows.length ? `- ${type} : ${rows.length} jambe(s), écart combiné ${sgn(combine(rows).est)} R/trade, z = ${combine(rows).z.toFixed(2)}` : `- ${type} : aucune jambe avec assez de trades aux deux sessions`);
  }
  md.push('', '## Limites', '', '- Plusieurs mécanismes ne tradent que dans une fenêtre horaire : peu de jambes comparables.', '- Spread constant ; exécution du bot simulée (`LIVE_FILL=1`) sur bougies M15 reconstruites.', '- Un écart, même solide, ne dit pas pourquoi (calme, algorithmes, autre).');
  fs.writeFileSync('data/backtest-input/night-hypothesis-study.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
