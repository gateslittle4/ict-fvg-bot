// Nouvelle règle de stop (confirmée par Esdras le 30/09) : le stop est sous le PLUS BAS de la BOUGIE D'IMPULSION (celle du milieu
// du FVG, celle qui a fait le gap), moins une marge — pas sous le bord de la zone. Vérification sur les 11 exemples.
// Lancer : node scripts/research-fvg-esdras/exp-stop-impulsion.mjs
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).href;
const { OFF } = await import(R + 'scripts/lib/m1Data.js');
const { buildZones } = await import(R + 'scripts/lib/fvgFollow.js');
const DIR = 'data/esdras-examples/';
const load = (s) => JSON.parse(fs.readFileSync(`${DIR}live-${s}.json`, 'utf8')).candles.slice(0, -1).map((c) => ({ time: c.time - OFF, open: c.open, high: c.high, low: c.low, close: c.close }));
const BAR = { US100: load('US100'), US500: load('US500') };
const Z = { US100: buildZones(BAR.US100), US500: buildZones(BAR.US500) };
const hm = (t) => new Date(t + OFF).toISOString().slice(5, 16).replace('T', ' ');
const f = (x) => x.toFixed(2);
const day = (s) => Date.parse(s + 'T00:00:00Z') - OFF;
// boîte d'entrée dessinée par Esdras, cible = fvg à gauche dessiné (null si non encadré)
// cible A = la ligne 4hr qu'Esdras a dessinée (cible = ce niveau) ; cible B = son fvg à gauche dessiné
const EX = [
  { n: '1', s: 'US100', dir: 1, lo: 28850, hi: 28915, from: '2026-09-13', to: '2026-09-16', line: 29125, tp: [29000, 29050] },
  { n: '2', s: 'US100', dir: -1, lo: 29610, hi: 29650, from: '2026-09-17', to: '2026-09-19', line: 29390, tp: [29420, 29455] },
  { n: '3', s: 'US100', dir: -1, lo: 30715, hi: 30780, from: '2026-09-22', to: '2026-09-24', line: 30495, tp: [30535, 30625] },
  { n: '4', s: 'US100', dir: 1, lo: 30510, hi: 30545, from: '2026-09-21', to: '2026-09-23', line: 30665, tp: [30605, 30635] },
  { n: '5', s: 'US100', dir: 1, lo: 30250, hi: 30290, from: '2026-09-23', to: '2026-09-25', line: 30570, tp: [30567, 30570] },
  { n: '6', s: 'US500', dir: -1, lo: 7697, hi: 7703, from: '2026-09-28', to: '2026-09-30', line: 7666, tp: [7677, 7684] },
  { n: '7a', s: 'US500', dir: 1, lo: 7628, hi: 7635, from: '2026-09-10', to: '2026-09-12', line: 7694, tp: [7670, 7678] },
  { n: '7b', s: 'US500', dir: 1, lo: 7620, hi: 7626, from: '2026-09-10', to: '2026-09-12', line: 7694, tp: [7670, 7678] },
  { n: '8', s: 'US500', dir: 1, lo: 7600, hi: 7610, from: '2026-09-13', to: '2026-09-16', line: 7641, tp: [7632, 7637] },
  { n: '9', s: 'US500', dir: -1, lo: 7660, hi: 7670, from: '2026-09-17', to: '2026-09-19', line: 7620.5, tp: [7628, 7635] },
  { n: '10', s: 'US500', dir: -1, lo: 7738, hi: 7748, from: '2026-09-22', to: '2026-09-24', line: 7703.5, tp: [7708, 7712] },
];
// marge : proportionnelle au prix (2,9 pts sur 30 279 = 0,0096 % → arrondi à 0,01 % de la distance bord-impulsion)
const MARGE = 0.0001;
let winsA = 0, winsB = 0, filled = 0, notFilled = 0;
console.log('Ex | paire | entrée (heure UTC) | stop impulsion | risque | cible A (4hr) | cible B (fvg gauche) | issue A | issue B');
for (const ex of EX) {
  const bars = BAR[ex.s], tol = ex.s === 'US100' ? 20 : 5;
  const zs = Z[ex.s].filter((z) => z.dir === ex.dir && z.T >= day(ex.from) && z.T < day(ex.to) && z.remInf <= ex.hi + tol && z.remSup >= ex.lo - tol);
  if (!zs.length) { console.log(`${ex.n.padEnd(3)} | aucune zone dans la boîte`); continue; }
  for (const z of zs.slice(0, 1)) {
    const buy = z.dir > 0, entry = buy ? z.remSup : z.remInf;
    // bougie d'impulsion = k1-1 (celle du milieu du FVG, celle qui a fait le gap)
    const imp = bars[z.k1 - 1];
    const newStop = buy ? Math.min(z.remInf, imp.low) * (1 - MARGE) : Math.max(z.remSup, imp.high) * (1 + MARGE);
    const risk = Math.abs(entry - newStop);
    const tpA = ex.line, tpB = ex.tp ? (buy ? Math.min(...ex.tp) : Math.max(...ex.tp)) : null;
    let fill = -1;
    for (let i = z.k1 + 2; i < z.k1 + 98 && fill < 0; i++) if (buy ? bars[i].low <= entry : bars[i].high >= entry) fill = i;
    if (fill < 0) { notFilled++; console.log(`${ex.n.padEnd(3)} | ${ex.s.padEnd(5)} | ${f(entry)} | ${f(newStop)} | ${f(risk)} | ${f(tpA)} | ${tpB ? f(tpB) : '—'} | jamais rempli | jamais rempli`); continue; }
    filled++;
    const res = (target) => {
      if (target == null) return '—';
      for (let j = fill; j < Math.min(bars.length, fill + 96); j++) {
        const d = bars[j];
        if (buy ? d.low <= newStop : d.high >= newStop) return 'PERDANT';
        if (buy ? d.high >= target : d.low <= target) return `GAGNANT ${((Math.abs(target - entry)) / risk).toFixed(1)}R`;
      }
      return 'timeout';
    };
    const rA = res(tpA), rB = res(tpB);
    if (rA.startsWith('GAGNANT')) winsA++; if (rB.startsWith('GAGNANT')) winsB++;
    console.log(`${ex.n.padEnd(3)} | ${ex.s.padEnd(5)} | ${f(entry)} (${hm(bars[fill].time)}) | ${f(newStop)} | ${f(risk)} | ${f(tpA)} | ${tpB ? f(tpB) : '—'} | ${rA.padEnd(12)} | ${rB}`);
  }
}
console.log(`\nStop sous la bougie d'impulsion : ${filled} ordres remplis, ${notFilled} jamais rempli.`);
console.log(`  Cible = la ligne 4hr dessinée      : ${winsA}/${filled} gagnants`);
console.log(`  Cible = le fvg à gauche dessiné   : ${winsB}/${filled} gagnants`);