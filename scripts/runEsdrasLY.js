#!/usr/bin/env node
// runEsdrasLY.js - « version échelle » LY d'Esdras (zones au sens large, stop à la zone suivante, 3 entrées, objectifs en chaîne),
// voir signalsLY / executeLY dans lib/esdrasMethod.js.
// Usage : node --max-old-space-size=12000 scripts/runEsdrasLY.js match     (signaux autour des trades du journal du simulateur, sans performance)
//         node --max-old-space-size=12000 scripts/runEsdrasLY.js explore   (pré-enregistrement preregistration-esdras-ly-2026-09-28.md)
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { signalsLY, executeLY } from './lib/esdrasMethod.js';

const mode = process.argv[2] || 'match', SYM = 'US100';
const OFF = 5 * 3600000; // heure du moteur (EST fixe) -> UTC réel
const ny = (t) => new Date(t + OFF).toLocaleString('fr-FR', { timeZone: 'America/New_York', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const opts = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) };
const QUIZ = { minZonePct: 0.0002, minRiskAtr: 0.3, maxEntryAtr: 3 };
const VARIANTS = process.argv.includes('--big') ? { 'LY-G': { bigBms: { minBodyAtr: 1 } }, 'LY-GQ': { ...QUIZ, bigBms: { minBodyAtr: 1 } } } : { LY: {} };

if (mode === 'match') {
  // mêmes bougies M15 que le simulateur (data/backtest-input/US100.csv, heure du moteur), et bougies du compte en direct si fournies
  const fromCsv = (a, b) => { const rows = fs.readFileSync('data/backtest-input/US100.csv', 'utf8').split('\n').slice(1).map((l) => l.split(',').map(Number)).filter((r) => r[0] >= a && r[0] < b);
    const f = (k) => Float64Array.from(rows, (r) => r[k]); return { t: f(0), o: f(1), h: f(2), l: f(3), c: f(4), n: rows.length }; };
  const cases = [['séance du 25-27/06/2018', fromCsv(Date.parse('2018-06-11') - OFF, Date.parse('2018-06-29') - OFF), Date.parse('2018-06-25T00:00:00Z') - OFF, Date.parse('2018-06-28T00:00:00Z') - OFF],
    ['séance du 19-21/06/2017', fromCsv(Date.parse('2017-06-05') - OFF, Date.parse('2017-06-23') - OFF), Date.parse('2017-06-19T00:00:00Z') - OFF, Date.parse('2017-06-22T00:00:00Z') - OFF]];
  if (process.argv[3]) { const c = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).candles; const f = (k) => Float64Array.from(c, (x) => x[k]);
    cases.push(['compte en direct, 24-28/09/2026', { t: Float64Array.from(c, (x) => x.time - OFF), o: f('open'), h: f('high'), l: f('low'), c: f('close'), n: c.length }, Date.parse('2026-09-24T00:00:00Z') - OFF, Date.parse('2026-09-29T00:00:00Z') - OFF]); }
  for (const [name, S, from, to] of cases) {
    const X = buildContext(S);
    console.log(`##### ${name}`);
    for (const [k, o] of Object.entries(VARIANTS)) {
      console.log(`== ${k}`);
      for (const s of signalsLY(X, o).filter((x) => x.tau >= from && x.tau < to)) console.log(`  signal ${ny(s.tau)} ${s.dir > 0 ? 'ACHAT' : 'VENTE'} échelle ${s.plan.map((p) => `${p.entry.toFixed(2)}/${p.stop.toFixed(2)}`).join(' | ')} objectifs ${s.targets.slice(0, 3).map((t) => t.toFixed(2)).join(', ')}`);
      for (const t of executeLY(X, signalsLY(X, o), opts).filter((x) => x.tau >= from && x.tau < to)) console.log(`  trade  ${ny(t.entryTime)} ${t.dir > 0 ? 'ACHAT' : 'VENTE'} entrée ${t.step} ${t.fill.toFixed(2)} objectif ${t.target.toFixed(2)} -> ${t.reason} ${ny(t.exitTime)} ${sgn(t.r, 2)}R`);
    }
  }
} else {
  const P = PHASES[mode], S = loadPhase(SYM, mode), X = buildContext(S);
  const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R  creux max ${s.maxDD.toFixed(1)} R`;
  const lines = [`# Version échelle LY d'Esdras : ${SYM} ${mode}`, '', '```'], out = {};
  const log = (s) => { console.log(s); lines.push(s); };
  for (const [k, o] of Object.entries(VARIANTS)) {
    const tr = executeLY(X, signalsLY(X, o), opts), c = tr.filter((t) => inBlocks(t.entryTime, P.count)), s = stats(c);
    const r = c.map((t) => t.r).sort((x, y) => y - x);
    log(`${k}  ${fmt(s)}  sans les 5 meilleurs ${sgn(r.slice(5).reduce((x, y) => x + y, 0), 1)} R`);
    for (const st of [1, 2, 3]) log(`   entrée ${st} : ${fmt(stats(c.filter((t) => t.step === st)))}`);
    if (P.descriptive) log(`   2025 (descriptif) ${fmt(stats(tr.filter((t) => inBlocks(t.entryTime, P.descriptive))))}`);
    if (mode === 'explore') { const v = exploreVerdict(c, P.halves); const ok = s.n >= 60 && s.mean > 0 && s.t >= 2.5 && v.halves.every((h) => h.sum > 0); log(`   ${k} : ${ok ? 'RETENUE' : 'REJETÉE'} (moitiés ${v.halves.map((h) => sgn(h.mean, 3)).join(' / ')} R ; seuil t 2,5)`); }
    out[k] = c.map((t) => ({ t: t.entryTime, r: t.r }));
  }
  lines.push('```');
  const SUF = process.argv.includes('--big') ? '-big' : '';
  fs.writeFileSync(`data/backtest-input/esdras-ly${SUF}-${SYM}-${mode}.md`, lines.join('\n') + '\n');
  fs.writeFileSync(`data/backtest-input/esdras-ly${SUF}-${SYM}-${mode}.json`, JSON.stringify(out));
}
