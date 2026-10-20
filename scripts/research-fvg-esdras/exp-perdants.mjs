// Étude des 6 exemples PERDANTS (1, 2, 3, 6, 8, 9) : tout ce qu'il faut pour comprendre pourquoi la photo a gagné.
// Pour chaque trade : les 3 bougies du FVG + la suivante, la bougie de remplissage, le stop d'impulsion, la cible,
// le chemin barre par barre après l'entrée (jusqu'au stop ou à la fin de 4 h), la pire excursion en R, et où le prix est allé
// par rapport à la cible et à la ligne 4hr dessinées. AUCUNE performance lue, aucun trade gagnant listé.
// Lancer : node scripts/research-fvg-esdras/exp-perdants.mjs
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
const MARGE = 0.0001;
// les 6 perdants, avec la cible fvg à gauche DESSINÉE par Esdras et sa ligne 4hr
const EX = [
  { n: '1', s: 'US100', dir: 1, lo: 28850, hi: 28915, from: '2026-09-13', to: '2026-09-16', line: 29125, tp: [29000, 29050], note: 'photo : ACHAT, entrée 28 850-28 915, 4hr high 29 125' },
  { n: '2', s: 'US100', dir: -1, lo: 29610, hi: 29650, from: '2026-09-17', to: '2026-09-19', line: 29390, tp: [29420, 29455], note: 'photo : VENTE, entrée 29 610-29 650, 4hr low 29 390' },
  { n: '3', s: 'US100', dir: -1, lo: 30715, hi: 30780, from: '2026-09-22', to: '2026-09-24', line: 30495, tp: [30535, 30625], note: 'photo : VENTE, entrée 30 715-30 780, 4hr low 30 495' },
  { n: '6', s: 'US500', dir: -1, lo: 7697, hi: 7703, from: '2026-09-28', to: '2026-09-30', line: 7666, tp: [7677, 7684], note: 'photo : VENTE, entrée 7 697-7 703, 4hr low 7 666' },
  { n: '8', s: 'US500', dir: 1, lo: 7600, hi: 7610, from: '2026-09-13', to: '2026-09-16', line: 7641, tp: [7632, 7637], note: 'photo : ACHAT, entrée 7 600-7 610, 4hr high 7 641' },
  { n: '9', s: 'US500', dir: -1, lo: 7660, hi: 7670, from: '2026-09-17', to: '2026-09-19', line: 7620.5, tp: [7628, 7635], note: 'photo : VENTE, entrée 7 660-7 670, 4hr low 7 620,5' },
];
for (const ex of EX) {
  const bars = BAR[ex.s], tol = ex.s === 'US100' ? 20 : 5;
  const zs = Z[ex.s].filter((z) => z.dir === ex.dir && z.T >= day(ex.from) && z.T < day(ex.to) && z.remInf <= ex.hi + tol && z.remSup >= ex.lo - tol);
  console.log(`\n\n########## EXEMPLE ${ex.n} — ${ex.s} — ${ex.dir > 0 ? 'ACHAT' : 'VENTE'} ##########`);
  console.log(ex.note);
  if (!zs.length) { console.log('  aucune zone dans ta boîte'); continue; }
  const z = zs[0];
  const buy = z.dir > 0, entry = buy ? z.remSup : z.remInf;
  const imp = bars[z.k1 - 1], k2 = bars[z.k1 - 2];
  const stop = buy ? Math.min(z.remInf, imp.low) * (1 - MARGE) : Math.max(z.remSup, imp.high) * (1 + MARGE);
  const risk = Math.abs(entry - stop);
  const tp = buy ? Math.min(...ex.tp) : Math.max(...ex.tp);
  console.log(`\nZone (partie non mangée) : ${f(z.remInf)} - ${f(z.remSup)}   entrée (bord proximal) : ${f(entry)}`);
  console.log(`Stop sous la bougie d'impulsion : ${f(stop)}   risque : ${f(risk)} points`);
  console.log(`Cible (ton fvg à gauche, bord proche) : ${f(tp)}   soit ${f(Math.abs(tp - entry))} points = ${(Math.abs(tp - entry) / risk).toFixed(1)} R`);
  console.log(`Ligne 4hr dessinée : ${f(ex.line)}   soit ${f(Math.abs(ex.line - entry))} points = ${(Math.abs(ex.line - entry) / risk).toFixed(1)} R`);
  console.log(`\n--- Les 3 bougies du FVG (+ la suivante) ---`);
  for (let j = z.k1 - 2; j <= z.k1 + 1; j++) {
    const c = bars[j];
    const lab = j === z.k1 - 2 ? '  [bougie 1 : le gap commence ici]' : j === z.k1 - 1 ? '  [bougie 2 : IMPULSION — le stop est sous son plus bas]' : j === z.k1 ? '  [bougie 3 : le FVG est confirmé]' : '  [bougie 4 : validité — elle mange la partie haute/basse]';
    console.log(`  ${hm(c.time)} UTC O ${f(c.open)} H ${f(c.high)} L ${f(c.low)} C ${f(c.close)}  corps ${f(Math.abs(c.close - c.open))}  mèches H ${f(c.high - Math.max(c.open, c.close))} / B ${f(Math.min(c.open, c.close) - c.low)}${lab}`);
  }
  // remplissage
  let fill = -1;
  for (let i = z.k1 + 2; i < z.k1 + 98 && fill < 0; i++) if (buy ? bars[i].low <= entry : bars[i].high >= entry) fill = i;
  if (fill < 0) { console.log('\n  >>> jamais rempli'); continue; }
  console.log(`\n--- Entrée ---`);
  console.log(`  LIMIT ${f(entry)} remplie à ${hm(bars[fill].time)} UTC (${((bars[fill].time - bars[z.k1].time) / 3600000).toFixed(1)} h après le FVG, à la bougie n°${fill - z.k1 + 1})`);
  console.log(`  Bougie de remplissage : O ${f(bars[fill].open)} H ${f(bars[fill].high)} L ${f(bars[fill].low)} C ${f(bars[fill].close)}`);
  // chemin
  let mfe = 0, mfeT = null, hitStop = false, hitStopT = null, hitTp = false, hitTpT = null, hitLine = false;
  console.log(`\n--- Chemin après l'entrée (barre par barre, jusqu'au stop ou 4 h) ---`);
  for (let j = fill; j < Math.min(bars.length, fill + 16); j++) {
    const c = bars[j];
    const gain = buy ? (c.high - entry) / risk : (entry - c.low) / risk;
    const move = buy ? c.high - entry : entry - c.low;
    mfe = buy ? Math.max(mfe, move) : Math.max(mfe, move);
    const note = [];
    if (buy ? c.high >= ex.line : c.low <= ex.line) { if (!hitLine) { hitLine = true; note.push('*** TOUCHE TA LIGNE 4HR ***'); } }
    if (buy ? c.high >= tp : c.low <= tp) { if (!hitTp) { hitTp = true; note.push('*** TOUCHE TA CIBLE fvg à gauche ***'); } }
    if (buy ? c.low <= stop : c.high >= stop) { if (!hitStop) { hitStop = true; hitStopT = c.time; note.push('*** STOP ***'); } }
    const win = buy ? (c.close - entry) / risk : (entry - c.close) / risk;
    console.log(`  ${hm(c.time)} H ${f(c.high)} L ${f(c.low)} C ${f(c.close)}  pire ${f(move).padStart(7)} pts = ${gain.toFixed(2).padStart(6)}R  clôture ${win.toFixed(2).padStart(6)}R ${note.join(' ')}`);
    if (hitStop) break;
  }
  console.log(`\n--- Bilan ---`);
  console.log(`  Pire excursion : ${f(mfe)} points = ${(mfe / risk).toFixed(2)} R`);
  console.log(`  Ta cible atteinte : ${hitTp ? `OUI le ${hm(hitTpT)}` : 'NON'}`);
  console.log(`  Ta ligne 4hr atteinte : ${hitLine ? 'OUI' : 'NON'}`);
  console.log(`  Stop touché : ${hitStop ? `OUI le ${hm(hitStopT)}` : 'NON'}`);
  // où le prix est allé au-delà de l'entrée
  let hiAfter = -Infinity, loAfter = Infinity;
  for (let j = fill; j < Math.min(bars.length, fill + 96); j++) { hiAfter = Math.max(hiAfter, bars[j].high); loAfter = Math.min(loAfter, bars[j].low); }
  console.log(`  Dans les 24 h suivant : plus haut ${f(hiAfter)} (${f(buy ? hiAfter - entry : entry - loAfter)} pts au-delà de l'entrée), plus bas ${f(loAfter)}`);
}