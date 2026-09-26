#!/usr/bin/env node
// buildBlindSetups.js - exercice à l'aveugle (proposé dans night-report-2026-09-26.md, accepté par Esdras) : 200 FVG M15 US100 tirés
// au hasard dans 2011-2018 (jamais tradés par lui), qualifiés entre 3 h et 11 h NY (le FVG vivant le plus récent de son sens, prix
// dedans ou juste au-delà, 0 à 24 bougies d'âge ; un seul par journée). Pour chacun : le graphique M15 (24 h) et H4 (≈ 10 jours) coupé
// à la clôture de décision, sans date. Les résultats mécaniques sont calculés à part (blind-outcomes.json), jamais montrés dans la page.
// Usage : node --max-old-space-size=12000 scripts/buildBlindSetups.js
//   -> data/blind/setups.json (la page) et data/backtest-input/blind-outcomes.json (résultats, pour l'analyse après ses réponses)
import fs from 'node:fs';
import { loadPhase, spreadAt, swapCost, simulate, nyMin, dayKey, dayOfWeek, MIN, HOUR, makeBars, h4Key, lastDoneBar } from './lib/nightLab.js';
import { buildContext, atrH1At } from './lib/fvgContext.js';
import { qualifications, opportunities, nextNyTime, featuresOf } from './lib/eyeRule.js';
import { eng } from './lib/m1Data.js';

// SET=soir : 100 cas de plus entre 19 h et 23 h NY (les heures du soir d'Esdras), ajoutés à la suite (s201…) sans toucher aux 200
// premiers ; sortie mécanique à 3 h NY au lieu de 11 h.
const EVENING = process.env.SET === 'soir';
const N = EVENING ? 100 : 200, SYM = 'US100', FIRST = EVENING ? 201 : 1, EXIT = EVENING ? 180 : 660;
const WIN = EVENING ? { fromMin: 1140, toMin: 1380 } : { fromMin: 180, toMin: 660 };
let seed = EVENING ? 26092027 : 26092026; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const S = loadPhase(SYM, 'explore'), X = buildContext(S);
const opps = opportunities(qualifications(X), { ageMin: 0, ageMax: 24, ...WIN }).filter((o) => o.tau >= eng(2011, 1) && o.tau < eng(2019));
const byDay = new Map(); for (const o of opps) { const k = dayKey(o.tau); (byDay.get(k) || byDay.set(k, []).get(k)).push(o); }
const days = [...byDay.keys()];
for (let i = days.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [days[i], days[j]] = [days[j], days[i]]; }
const r2 = (x) => Math.round(x * 100) / 100;
const setups = [], outcomes = [];
for (const d of days) {
  if (setups.length >= N) break;
  const list = byDay.get(d), o = list[Math.floor(rnd() * list.length)];
  const f = featuresOf(X, o); if (!f) continue;
  const j = o.j, i = X.b15[j].i1 + 1, atr = atrH1At(X, i); if (!atr || j < 100) continue;
  const m15 = X.b15.slice(j - 95, j + 1).map((b) => [r2(b.o), r2(b.h), r2(b.l), r2(b.c)]);
  const jh = lastDoneBar(X.b4h, i); if (jh < 30) continue;
  const cur = X.b4h[jh + 1] && X.b4h[jh + 1].i0 < i ? X.b4h[jh + 1] : null; // H4 en cours, coupée à la décision
  const h4 = X.b4h.slice(jh - 29, jh + 1).map((b) => [r2(b.o), r2(b.h), r2(b.l), r2(b.c)]);
  if (cur) { let h = -Infinity, l = Infinity; for (let m = cur.i0; m < i; m++) { h = Math.max(h, S.h[m]); l = Math.min(l, S.l[m]); } h4.push([r2(cur.o), r2(h), r2(l), r2(S.c[i - 1])]); }
  const id = `s${String(setups.length + FIRST).padStart(3, '0')}`;
  const tau = o.tau, nm = nyMin(tau);
  setups.push({ id, dir: o.dir, nyTime: `${String(Math.floor(nm / 60)).padStart(2, '0')}h${String(nm % 60).padStart(2, '0')}`, weekday: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dayOfWeek(tau)],
    zone: [r2(o.z.bot), r2(o.z.top)], zoneBar: 95 - (j - o.k), m15, h4, atrH1: r2(atr) });
  // résultats mécaniques (jamais dans la page)
  const sp = spreadAt(SYM, S.o[i]), f0 = o.dir > 0 ? S.o[i] + sp : S.o[i], exitAt = nextNyTime(tau, EXIT), sw = swapCost(SYM);
  const far = o.dir > 0 ? o.z.bot : o.z.top; let zs = far - o.dir * 0.1 * atr; if (Math.abs(f0 - zs) < 0.3 * atr) zs = f0 - o.dir * 0.3 * atr;
  const run = (spec) => { const r = simulate(S, { dir: o.dir, i, exitAt, spread: sp, swap: sw, ...spec }); return r.missed ? null : Math.round(r.r * 1000) / 1000; };
  outcomes.push({ id, time: tau, age: o.age, features: f,
    r: { atr1_3R_11h: run({ stop: f0 - o.dir * atr, rr: 3 }), zone_3R_11h: run({ stop: zs, rr: 3 }), atr1_2R_11h: run({ stop: f0 - o.dir * atr, rr: 2 }), atr1_3R_16h: run({ stop: f0 - o.dir * atr, rr: 3, exitAt: nextNyTime(tau, 960) }) } });
}
fs.mkdirSync('data/blind', { recursive: true });
if (EVENING) {
  const prev = JSON.parse(fs.readFileSync('data/blind/setups.json', 'utf8')), prevO = JSON.parse(fs.readFileSync('data/backtest-input/blind-outcomes.json', 'utf8'));
  setups.unshift(...prev.setups.filter((x) => +x.id.slice(1) < FIRST)); outcomes.unshift(...prevO.outcomes.filter((x) => +x.id.slice(1) < FIRST));
}
for (const o of outcomes) o.exitNy ??= +o.id.slice(1) >= 201 ? '03h' : '11h';
fs.writeFileSync('data/blind/setups.json', JSON.stringify({ symbol: SYM, note: 'FVG M15 US100 2011-2018, dates masquées', setups }));
fs.writeFileSync('data/backtest-input/blind-outcomes.json', JSON.stringify({ note: 'Résultats mécaniques des cas de l\'exercice à l\'aveugle (clés *_11h = sortie à 11 h NY, ou 3 h NY pour s201+ : champ exitNy) — NE PAS montrer à Esdras avant ses réponses', outcomes }));
const mean = (k) => { const a = outcomes.map((x) => x.r[k]).filter((x) => x != null); return (a.reduce((s, x) => s + x, 0) / a.length).toFixed(3); };
console.log(`${setups.length} cas (achats ${setups.filter((s) => s.dir > 0).length}), taille ${(fs.statSync('data/blind/setups.json').size / 1024).toFixed(0)} Ko ; moyenne mécanique (tous) : ${mean('atr1_3R_11h')} R`);
