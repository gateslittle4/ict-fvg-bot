#!/usr/bin/env node
// buildWarmupSetups.js - échauffement avant l'exercice à l'aveugle (demandé par Esdras le 27/09 : « fais-moi l'échauffement »).
// 40 FVG M15 US100 tirés dans 2019-2022, même règle que le test (C forme le FVG, D se ferme hors de la zone, graphique arrêté à D),
// 28 le matin (3 h-11 h NY) et 12 le soir (19 h-23 h NY). Ici la suite EST montrée après chaque réponse (comme en backtest) : les
// bougies M15 jusqu'à l'heure de sortie et le résultat de l'ordre au bord (stop sous la mèche de A, objectif 3R).
// Ces années ne servent à rien d'autre : le test se fait sur 2011-2018, et la règle tirée de son œil sera testée une seule fois sur
// 2023-2026. La validation de nuit (2019-2022) est close ; relire ces années pour l'échauffement ne change aucun verdict.
// Usage : node --max-old-space-size=12000 scripts/buildWarmupSetups.js -> data/blind/warmup.json
import fs from 'node:fs';
import { loadPhase, spreadAt, swapCost, simulate, nyMin, dayKey, dayOfWeek, MIN, lastDoneBar } from './lib/nightLab.js';
import { buildContext, atrH1At } from './lib/fvgContext.js';
import { nextNyTime } from './lib/eyeRule.js';
import { eng } from './lib/m1Data.js';

const SYM = 'US100', M15N = 160, H4N = 42, AFTER_MAX = 64;
const S = loadPhase(SYM, 'validation', { NIGHT_PHASE: 'validation' }), X = buildContext(S); // échauffement seulement, voir en-tête
const r2 = (x) => Math.round(x * 100) / 100, bar = (b) => [r2(b.o), r2(b.h), r2(b.l), r2(b.c)];
const cases = [], usedDays = new Set();
function build({ n, win, exit, seed, prefix }) {
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const { b15 } = X, inWin = (m) => m >= win.fromMin && m < win.toMin, opps = [];
  for (const z of X.fvg[0]) {
    const k = z.k, j = k + 1; if (j >= b15.length - 1 || j < M15N) continue;
    const D = b15[j], tau = D.t + 15 * MIN;
    if (tau < eng(2019) || tau >= eng(2023)) continue;
    if (!inWin(nyMin(b15[k].t + 15 * MIN)) || !inWin(nyMin(tau))) continue;
    if (z.dir > 0 ? D.l <= z.top : D.h >= z.bot) continue;
    if (b15[j + 1].t - tau > 5 * MIN) continue;
    opps.push({ j, tau, dir: z.dir, k, z });
  }
  const byDay = new Map(); for (const o of opps) { const d = dayKey(o.tau); (byDay.get(d) || byDay.set(d, []).get(d)).push(o); }
  const days = [...byDay.keys()];
  for (let i = days.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [days[i], days[j]] = [days[j], days[i]]; }
  let made = 0;
  for (const d of days) {
    if (made >= n) break;
    if (usedDays.has(d)) continue;
    const list = byDay.get(d), o = list[Math.floor(rnd() * list.length)], j = o.j, i = b15[j].i1 + 1;
    const atr = atrH1At(X, i); if (!atr) continue;
    const jh = lastDoneBar(X.b4h, i); if (jh < H4N) continue;
    const exitAt = nextNyTime(o.tau, exit), after = [];
    for (let m = j + 1; m < b15.length && b15[m].t < exitAt && after.length < AFTER_MAX; m++) after.push(bar(b15[m]));
    if (after.length < 4) continue;
    const h4 = X.b4h.slice(jh - H4N + 1, jh + 1).map(bar), cur = X.b4h[jh + 1] && X.b4h[jh + 1].i0 < i ? X.b4h[jh + 1] : null;
    if (cur) { let h = -Infinity, l = Infinity; for (let m = cur.i0; m < i; m++) { h = Math.max(h, S.h[m]); l = Math.min(l, S.l[m]); } h4.push([r2(cur.o), r2(h), r2(l), r2(S.c[i - 1])]); }
    const L = o.dir > 0 ? o.z.top : o.z.bot, A = b15[o.k - 2], stop = o.dir > 0 ? A.l : A.h, target = L + o.dir * 3 * Math.abs(L - stop);
    const t = simulate(S, { dir: o.dir, i, entry: { type: 'limit', price: L }, expiry: exitAt, stop, rr: 3, target, cancelIfTarget: true, exitAt, spread: spreadAt(SYM, L), swap: swapCost(SYM) });
    const nm = nyMin(o.tau);
    made++; usedDays.add(d);
    cases.push({ id: `${prefix}${String(made).padStart(2, '0')}`, year: new Date(o.tau).getUTCFullYear(), dir: o.dir,
      nyTime: `${String(Math.floor(nm / 60)).padStart(2, '0')}h${String(nm % 60).padStart(2, '0')}`, weekday: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dayOfWeek(o.tau)],
      exitNy: exit === 180 ? '3h' : '11h', zone: [r2(o.z.bot), r2(o.z.top)], zoneBar: M15N - 1 - (j - o.k), m15: b15.slice(j - M15N + 1, j + 1).map(bar), h4, after,
      order: { entry: r2(L), stop: r2(stop), target: r2(target) }, result: t.missed ? { missed: t.missed } : { r: Math.round(t.r * 100) / 100, reason: t.reason } });
  }
}
build({ n: 28, win: { fromMin: 180, toMin: 660 }, exit: 660, seed: 27092001, prefix: 'w' });
build({ n: 12, win: { fromMin: 1140, toMin: 1380 }, exit: 180, seed: 27092002, prefix: 'v' });
// mélange matin et soir pour que l'échauffement ressemble au test
let seed = 27092003; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = cases.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cases[i], cases[j]] = [cases[j], cases[i]]; }
fs.writeFileSync('data/blind/warmup.json', JSON.stringify({ symbol: SYM, note: 'Échauffement 2019-2022 : la suite et le résultat sont montrés après chaque réponse', cases }));
const got = cases.filter((c) => c.result.r !== undefined);
console.log(`${cases.length} cas, ${got.length} ordres remplis, moyenne ${(got.reduce((a, c) => a + c.result.r, 0) / got.length).toFixed(2)} R, ${(fs.statSync('data/blind/warmup.json').size / 1024).toFixed(0)} Ko`);
