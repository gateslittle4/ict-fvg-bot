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
// Version 3 (26/09, règle confirmée par Esdras sur le schéma data/blind/regle-fvg.html) : la bougie C qui forme le FVG se ferme, la
// bougie D suivante se forme SANS toucher la zone, et le prix n'a le droit d'y entrer qu'à partir de E. Le graphique s'arrête à la
// fermeture de D ; question : « tu poses ton ordre ? ». Entrée : limite au bord proche (haut de la zone pour un achat). Stop : sous la
// zone, ou sous la mèche de la bougie A (celle qui fait le bas d'un FVG haussier / le haut d'un baissier). Objectifs 2, 3 et 4R ;
// ordre annulé si l'objectif est touché avant, ou à l'heure de sortie (11 h NY le matin, 3 h NY le soir). Identifiants a001… (matin)
// et b001… (soir) : les réponses des versions précédentes ne comptent pas.
function build({ n, win, exit, seed, prefix }) {
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const { b15 } = X, inWin = (m) => m >= win.fromMin && m < win.toMin;
  const opps = [];
  for (const z of X.fvg[0]) {
    const k = z.k, j = k + 1; if (j >= b15.length - 1 || j < M15N) continue;
    const D = b15[j], tau = D.t + 15 * MIN;
    if (tau < eng(2011, 1) || tau >= eng(2019)) continue;
    if (!inWin(nyMin(b15[k].t + 15 * MIN)) || !inWin(nyMin(tau))) continue;
    if (z.dir > 0 ? D.l <= z.top : D.h >= z.bot) continue; // D touche la zone : pas valide
    if (b15[j + 1].t - tau > 5 * MIN) continue; // marché fermé juste après
    opps.push({ j, tau, nm: nyMin(tau), dir: z.dir, k, age: 1, where: 'beyond', z });
  }
  const byDay = new Map(); for (const o of opps) { const k = dayKey(o.tau); (byDay.get(k) || byDay.set(k, []).get(k)).push(o); }
  const days = [...byDay.keys()];
  for (let i = days.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [days[i], days[j]] = [days[j], days[i]]; }
  let made = 0;
  for (const d of days) {
    if (made >= n) break;
    const list = byDay.get(d), o = list[Math.floor(rnd() * list.length)];
    if (usedDays.has(d)) continue;
    const f = featuresOf(X, o); if (!f) continue;
    const j = o.j, i = b15[j].i1 + 1, atr = atrH1At(X, i); if (!atr) continue;
    const jh = lastDoneBar(X.b4h, i); if (jh < H4N) continue;
    const m15 = b15.slice(j - M15N + 1, j + 1).map((b) => [r2(b.o), r2(b.h), r2(b.l), r2(b.c)]);
    const cur = X.b4h[jh + 1] && X.b4h[jh + 1].i0 < i ? X.b4h[jh + 1] : null; // H4 en cours, coupée à la décision
    const h4 = X.b4h.slice(jh - H4N + 1, jh + 1).map((b) => [r2(b.o), r2(b.h), r2(b.l), r2(b.c)]);
    if (cur) { let h = -Infinity, l = Infinity; for (let m = cur.i0; m < i; m++) { h = Math.max(h, S.h[m]); l = Math.min(l, S.l[m]); } h4.push([r2(cur.o), r2(h), r2(l), r2(S.c[i - 1])]); }
    const id = `${prefix}${String(1 + made).padStart(3, '0')}`;
    made++; usedDays.add(d);
    const tau = o.tau, nm = nyMin(tau);
    setups.push({ id, dir: o.dir, nyTime: `${String(Math.floor(nm / 60)).padStart(2, '0')}h${String(nm % 60).padStart(2, '0')}`, weekday: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dayOfWeek(tau)],
      zone: [r2(o.z.bot), r2(o.z.top)], zoneBar: M15N - 1 - (j - o.k), m15, h4, atrH1: r2(atr) });
    // résultats mécaniques (jamais dans la page) : limite au bord proche, deux stops, trois objectifs
    const L = o.dir > 0 ? o.z.top : o.z.bot, A = b15[o.k - 2], sp = spreadAt(SYM, L), exitAt = nextNyTime(tau, exit), sw = swapCost(SYM);
    const stops = { zone: o.dir > 0 ? o.z.bot : o.z.top, meche: o.dir > 0 ? A.l : A.h };
    const r = {};
    for (const [sk, stop] of Object.entries(stops)) for (const rr of [2, 3, 4]) {
      const target = L + o.dir * rr * Math.abs(L - stop);
      const t = simulate(S, { dir: o.dir, i, entry: { type: 'limit', price: L }, expiry: exitAt, stop, rr, target, cancelIfTarget: true, exitAt, spread: sp, swap: sw });
      r[`${sk}_${rr}R`] = t.missed ? { missed: t.missed } : { r: Math.round(t.r * 1000) / 1000, reason: t.reason };
    }
    outcomes.push({ id, time: tau, exitNy: exit === 180 ? '03h' : '11h', riskAtr: { zone: Math.abs(L - stops.zone) / atr, meche: Math.abs(L - stops.meche) / atr }, features: f, r });
  }
  return made;
}
const MORNING = { fromMin: 180, toMin: 660 }, EVENING = { fromMin: 1140, toMin: 1380 };
build({ n: 200, win: MORNING, exit: 660, seed: 26092040, prefix: 'a' });
build({ n: 100, win: EVENING, exit: 180, seed: 26092041, prefix: 'b' });
fs.mkdirSync('data/blind', { recursive: true });
fs.writeFileSync('data/blind/setups.json', JSON.stringify({ symbol: SYM, version: 3, note: 'FVG M15 US100 2011-2018 (bougie D hors de la zone), dates masquées, graphique arrêté à la fermeture de D', setups }));
fs.writeFileSync('data/backtest-input/blind-outcomes.json', JSON.stringify({ version: 3, note: 'Résultats mécaniques des cas de l\'exercice à l\'aveugle (limite au bord, stop sous la zone ou sous la mèche de A, 2/3/4R, annulé si objectif avant) — NE PAS montrer à Esdras avant ses réponses', outcomes }));
for (const k of ['zone_3R', 'meche_3R']) { const f = outcomes.map((x) => x.r[k]), got = f.filter((x) => x.r !== undefined); console.log(`${k} : ${got.length} remplis sur ${f.length}, moyenne ${(got.reduce((a, x) => a + x.r, 0) / got.length).toFixed(3)} R`); }
console.log(`${setups.length} cas, taille ${(fs.statSync('data/blind/setups.json').size / 1024).toFixed(0)} Ko`);
