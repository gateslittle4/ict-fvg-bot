#!/usr/bin/env node
// buildBlindSetups.js - exercice à l'aveugle (proposé dans night-report-2026-09-26.md, accepté par Esdras) : 200 FVG M15 US100 tirés
// au hasard dans 2011-2018 (jamais tradés par lui), qualifiés entre 3 h et 11 h NY (le FVG vivant le plus récent de son sens, prix
// dedans ou juste au-delà, 0 à 24 bougies d'âge ; un seul par journée). Pour chacun : le graphique M15 (24 h) et H4 (≈ 10 jours) coupé
// à la clôture de décision, sans date. Les résultats mécaniques sont calculés à part (blind-outcomes.json), jamais montrés dans la page.
// Usage : node --max-old-space-size=12000 scripts/buildBlindSetups.js (lots A à D ci-dessous)
//   -> data/blind/setups.json (la page) et data/backtest-input/blind-outcomes.json (résultats, pour l'analyse après ses réponses)
import fs from 'node:fs';
import { loadPhase, spreadAt, swapCost, simulate, nyMin, dayKey, dayOfWeek, MIN, HOUR, makeBars, h4Key, lastDoneBar } from './lib/nightLab.js';
import { buildContext, atrH1At } from './lib/fvgContext.js';
import { qualifications, opportunities, nextNyTime, featuresOf } from './lib/eyeRule.js';
import { eng } from './lib/m1Data.js';

// Version 2 (26/09, remarques d'Esdras) : « après le FVG, laisse 30 min s'écouler pour qu'il soit viable » -> âge >= 2 bougies M15
// (dans la v1, 3 cas sur 4 étaient des FVG tout juste formés, dont ses 7 premières réponses : ils sont retirés) ; graphique dézoomé
// (160 bougies M15 = 40 h, 42 H4 = 7 jours). Lots : m001-m200 le matin 3 h-11 h NY (sortie mécanique 11 h), e001-e100 le soir
// 19 h-23 h NY (ses heures du soir, sortie 3 h NY). Nouveaux identifiants : les réponses de la v1 (s001…) ne comptent pas.
const SYM = 'US100', M15N = 160, H4N = 42, MINAGE = 2;
const S = loadPhase(SYM, 'explore'), X = buildContext(S);
const quals = qualifications(X);
const r2 = (x) => Math.round(x * 100) / 100;
const setups = [], outcomes = [], usedDays = new Set();
function build({ n, win, exit, seed, ageMin, prefix }) {
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const opps = opportunities(quals, { ageMin, ageMax: 24, ...win }).filter((o) => o.tau >= eng(2011, 1) && o.tau < eng(2019))
    .filter((o) => { const fm = nyMin(X.b15[o.k].t + 15 * MIN); return fm >= win.fromMin && fm < win.toMin; }); // FVG formé DANS la fenêtre (sinon les FVG de la nuit s'entassent à son ouverture)
  const byDay = new Map(); for (const o of opps) { const k = dayKey(o.tau); (byDay.get(k) || byDay.set(k, []).get(k)).push(o); }
  const days = [...byDay.keys()];
  for (let i = days.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [days[i], days[j]] = [days[j], days[i]]; }
  let made = 0;
  for (const d of days) {
    if (made >= n) break;
    const list = byDay.get(d), o = list[Math.floor(rnd() * list.length)];
    if (usedDays.has(d)) continue;
    const f = featuresOf(X, o); if (!f) continue;
    const j = o.j, i = X.b15[j].i1 + 1, atr = atrH1At(X, i); if (!atr || j < M15N) continue;
    const jh = lastDoneBar(X.b4h, i); if (jh < H4N) continue;
    const m15 = X.b15.slice(j - M15N + 1, j + 1).map((b) => [r2(b.o), r2(b.h), r2(b.l), r2(b.c)]);
    const cur = X.b4h[jh + 1] && X.b4h[jh + 1].i0 < i ? X.b4h[jh + 1] : null; // H4 en cours, coupée à la décision
    const h4 = X.b4h.slice(jh - H4N + 1, jh + 1).map((b) => [r2(b.o), r2(b.h), r2(b.l), r2(b.c)]);
    if (cur) { let h = -Infinity, l = Infinity; for (let m = cur.i0; m < i; m++) { h = Math.max(h, S.h[m]); l = Math.min(l, S.l[m]); } h4.push([r2(cur.o), r2(h), r2(l), r2(S.c[i - 1])]); }
    const id = `${prefix}${String(1 + made).padStart(3, '0')}`;
    made++; usedDays.add(d);
    const tau = o.tau, nm = nyMin(tau);
    setups.push({ id, dir: o.dir, nyTime: `${String(Math.floor(nm / 60)).padStart(2, '0')}h${String(nm % 60).padStart(2, '0')}`, weekday: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dayOfWeek(tau)],
      zone: [r2(o.z.bot), r2(o.z.top)], zoneBar: M15N - 1 - (j - o.k), m15, h4, atrH1: r2(atr) });
    // résultats mécaniques (jamais dans la page)
    const sp = spreadAt(SYM, S.o[i]), f0 = o.dir > 0 ? S.o[i] + sp : S.o[i], exitAt = nextNyTime(tau, exit), sw = swapCost(SYM);
    const far = o.dir > 0 ? o.z.bot : o.z.top; let zs = far - o.dir * 0.1 * atr; if (Math.abs(f0 - zs) < 0.3 * atr) zs = f0 - o.dir * 0.3 * atr;
    const run = (spec) => { const r = simulate(S, { dir: o.dir, i, exitAt, spread: sp, swap: sw, ...spec }); return r.missed ? null : Math.round(r.r * 1000) / 1000; };
    outcomes.push({ id, time: tau, age: o.age, exitNy: exit === 180 ? '03h' : '11h', features: f,
      r: { atr1_3R_main: run({ stop: f0 - o.dir * atr, rr: 3 }), zone_3R_main: run({ stop: zs, rr: 3 }), atr1_2R_main: run({ stop: f0 - o.dir * atr, rr: 2 }), atr1_3R_16h: run({ stop: f0 - o.dir * atr, rr: 3, exitAt: nextNyTime(tau, 960) }) } });
  }
  return made;
}
const MORNING = { fromMin: 180, toMin: 660 }, EVENING = { fromMin: 1140, toMin: 1380 };
build({ n: 200, win: MORNING, exit: 660, seed: 26092030, ageMin: MINAGE, prefix: 'm' });
build({ n: 100, win: EVENING, exit: 180, seed: 26092031, ageMin: MINAGE, prefix: 'e' });
fs.mkdirSync('data/blind', { recursive: true });
fs.writeFileSync('data/blind/setups.json', JSON.stringify({ symbol: SYM, version: 2, note: 'FVG M15 US100 2011-2018 âgés d\'au moins 30 min, dates masquées', setups }));
fs.writeFileSync('data/backtest-input/blind-outcomes.json', JSON.stringify({ version: 2, note: 'Résultats mécaniques des cas de l\'exercice à l\'aveugle (*_main = sortie à 11 h NY le matin, 3 h NY le soir : champ exitNy) — NE PAS montrer à Esdras avant ses réponses', outcomes }));
const mean = (k) => { const a = outcomes.map((x) => x.r[k]).filter((x) => x != null); return (a.reduce((s2, x) => s2 + x, 0) / a.length).toFixed(3); };
const ages = outcomes.map((x) => x.age).sort((a, b) => a - b);
console.log(`${setups.length} cas, âge médian ${ages[ages.length >> 1]} bougies (min ${ages[0]}), taille ${(fs.statSync('data/blind/setups.json').size / 1024).toFixed(0)} Ko ; moyenne mécanique ${mean('atr1_3R_main')} R`);
