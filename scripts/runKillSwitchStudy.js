#!/usr/bin/env node
// runKillSwitchStudy.js
// Usage : node --max-old-space-size=6144 scripts/runKillSwitchStudy.js
//   (il faut data/live-replay/*.json, voir runLiveReplay.js, et data/histdata-m1 pour A/B)
//
// Règle de sécurité : arrêter définitivement une jambe dont la baisse dépasse 1,5 x sa pire baisse historique - EXACTEMENT telle que
// pré-enregistrée dans data/backtest-input/preregistration-kill-switch-2026-09-24.md (commité AVANT ce script).
// Rapport : data/backtest-input/kill-switch-study.md.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { buildSessions, orbTrade, noiseTrades } from './lib/intradayMomentum.js';
import { OFF, refPrice } from './lib/m1Data.js';

const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['train', 'Entraînement 2010-2022', Y(2010), Y(2023)], ['test', 'Test 2023-2025', Y(2023), Y(2026)], ['fwd', '2026 (→ fin des données)', Y(2026), Y(2027)]];
const HALVES = [['2010-2016', Y(2010), Y(2017)], ['2017-2022', Y(2017), Y(2023)]];

function readGz(file) {
  const txt = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  const t = [], o = [], h = [], l = [], c = [];
  let pos = txt.indexOf('\n') + 1;
  while (pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const p = txt.slice(pos, end).split(','); pos = end + 1;
    if (p.length < 5) continue;
    t.push(+p[0]); o.push(+p[1]); h.push(+p[2]); l.push(+p[3]); c.push(+p[4]);
  }
  return { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length };
}

function momentumLeg(sym, strat) {
  const ref = refPrice(sym), spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * p / ref;
  const out = [];
  for (const [file, keep] of [[`data/histdata-m1/${sym}.csv.gz`, (d) => d.dayNum * 86400000 < Y(2023)], [`data/real-m1-full/${sym}.csv.gz`, (d) => d.dayNum * 86400000 >= Y(2023)]]) {
    const days = buildSessions(readGz(file));
    for (let i = 0; i < days.length; i++) {
      if (!keep(days[i])) continue;
      if (strat === 'orb') { const a = orbTrade(days[i], spreadAt); if (a) out.push({ t: a.entryTime, v: a.r }); }
      else for (const b of noiseTrades(days, i, spreadAt)) out.push({ t: b.entryTime, v: b.ret * 100 });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

const MULT = 1.5;
const maxDD = (vals) => { let c = 0, pk = 0, dd = 0; for (const v of vals) { c += v; pk = Math.max(pk, c); dd = Math.max(dd, pk - c); } return dd; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);

/** Applique la règle à partir de `from` ; refAt(t) = référence connue au moment t. Renvoie totaux et arrêt éventuel. */
function apply(trades, from, to, refAt) {
  const L = trades.filter((x) => x.t >= from && x.t < to);
  let c = 0, pk = 0, stoppedAt = null, withRule = 0, after = 0;
  for (const x of L) {
    if (stoppedAt !== null) { after += x.v; continue; }
    withRule += x.v; c += x.v; pk = Math.max(pk, c);
    const ref = refAt(x.t);
    if (ref > 0 && pk - c > MULT * ref) stoppedAt = x.t;
  }
  return { without: L.reduce((a, x) => a + x.v, 0), withRule, after, stoppedAt, n: L.length };
}

// --seed : écrit data/kill-switch-seed.json, le point de départ du filet de sécurité EN DIRECT (src/killSwitch.js) - l'évaluation 1
// (référence = pire baisse 2010-2022, règle appliquée depuis le 01/01/2023) jouée jusqu'à la fin des données ; le live continue à
// partir de là avec les vrais trades. B est exclu (sa baisse est en % du nominal, pas en R : les R du live ne sont pas comparables).
function writeSeed(legs) {
  const seedTime = Math.max(...['US100', 'US500'].map((s) => { const txt = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${s}.csv.gz`)).toString('latin1').trimEnd(); return Number(txt.slice(txt.lastIndexOf('\n') + 1).split(',')[0]); }));
  const out = { generatedBy: 'scripts/runKillSwitchStudy.js --seed', rule: 'preregistration-kill-switch-2026-09-24.md, évaluation 1', multiple: MULT, appliedFrom: new Date(Y(2023)).toISOString(), seedTime: new Date(seedTime).toISOString(), legs: {} };
  for (const [name, leg] of Object.entries(legs)) {
    if (leg.unit !== 'R') continue;
    const key = name === 'A (ORB) US100' ? 'orb5 US100' : name;
    const reference = maxDD(leg.trades.filter((x) => x.t < Y(2023)).map((x) => x.v));
    let c = 0, pk = 0, stoppedAt = null;
    for (const x of leg.trades.filter((x) => x.t >= Y(2023) && x.t <= seedTime)) {
      if (stoppedAt !== null) break;
      c += x.v; pk = Math.max(pk, c);
      if (reference > 0 && pk - c > MULT * reference) stoppedAt = x.t;
    }
    out.legs[key] = { reference: +reference.toFixed(2), limit: +(MULT * reference).toFixed(2), cumR: +c.toFixed(2), peakR: +pk.toFixed(2), stoppedAt: stoppedAt ? new Date(stoppedAt).toISOString() : null };
  }
  fs.writeFileSync('data/kill-switch-seed.json', JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
}

function main() {
  const combo = {};
  // Seules les tranches du rejeu fidèle (jamais les variantes, ex. *-sbrr<n>.json du test des RRR, ni *-spread*.json).
  for (const f of fs.readdirSync('data/live-replay').filter((x) => /^(hist|broker)-\d{4}-\d{4}\.json$/.test(x))) for (const t of JSON.parse(fs.readFileSync(`data/live-replay/${f}`, 'utf8')).trades) {
    (combo[`${t.source} ${t.symbol}`] ??= []).push({ t: t.entryTime + OFF, v: t.r });
  }
  const legs = Object.fromEntries(Object.entries(combo).map(([k, l]) => [k, { unit: 'R', trades: l.sort((a, b) => a.t - b.t) }]));
  legs['A (ORB) US100'] = { unit: 'R', trades: momentumLeg('US100', 'orb') };
  legs['B (noise area) US500'] = { unit: '%', trades: momentumLeg('US500', 'noise') };
  if (process.argv.includes('--seed')) return writeSeed(legs);
  const md = ['# Arrêt d\'une stratégie si sa baisse dépasse 1,5 × sa pire baisse historique — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-kill-switch-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runKillSwitchStudy.js`. Baisse = recul du R cumulé depuis son plus haut (B en % du nominal). Jambe arrêtée définitivement dès que sa baisse dépasse 1,5 × la référence.', ''];
  const verdicts = [];
  const evals = [
    ['1. Référence 2010-2022, appliquée au 01/01/2023 → 21/09/2026', Y(2023), Y(2027), (L) => { const ref = maxDD(L.filter((x) => x.t < Y(2023)).map((x) => x.v)); return () => ref; }],
    ['2. Glissante : référence mise à jour chaque 1er janvier (départ 2010-2014), appliquée 2015 → 2026', Y(2015), Y(2027), (L) => { const cache = new Map(); return (t) => { const y = new Date(t).getUTCFullYear(); if (!cache.has(y)) cache.set(y, maxDD(L.filter((x) => x.t < Y(y)).map((x) => x.v))); return cache.get(y); }; }],
  ];
  for (const [lab, from, to, mkRef] of evals) {
    md.push(`## ${lab}`, '', '| Jambe | Référence (pire baisse connue au départ) | Arrêtée ? | R après l\'arrêt (évité si négatif) | Total sans règle | Total avec règle |', '|---|---|---|---|---|---|');
    let wo = 0, wi = 0;
    for (const [name, leg] of Object.entries(legs)) {
      const refAt = mkRef(leg.trades), r = apply(leg.trades, from, to, refAt);
      const ref0 = refAt(from);
      md.push(`| ${name} | ${ref0.toFixed(1)} ${leg.unit} | ${r.stoppedAt ? new Date(r.stoppedAt).toISOString().slice(0, 10) : 'non'} | ${r.stoppedAt ? sgn(r.after) + ' ' + leg.unit : '—'} | ${sgn(r.without)} ${leg.unit} | ${sgn(r.withRule)} ${leg.unit} |`);
      if (leg.unit === 'R') { wo += r.without; wi += r.withRule; }
    }
    const ok = wi >= wo - 0.05 * Math.abs(wo);
    verdicts.push(ok);
    md.push('', `Jambes en R réunies : sans règle ${sgn(wo)} R, avec règle ${sgn(wi)} R → ${ok ? 'coût ≤ 5 %' : '**coût > 5 %**'}.`, '');
  }
  md.push('## Verdict', '', verdicts.every(Boolean) ? '**GARDÉE comme filet de sécurité** (coût ≤ 5 % dans les deux évaluations).' : '**REJETÉE** (coûte plus de 5 % dans au moins une évaluation).', '', '## Limites', '', '- Rejeu fidèle recollé par tranches ; B en % (hors total en R).', '- Une jambe arrêtée pourrait libérer des places pour d\'autres (position unique par paire, garde-fou) : non simulé.');
  fs.writeFileSync('data/backtest-input/kill-switch-study.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
