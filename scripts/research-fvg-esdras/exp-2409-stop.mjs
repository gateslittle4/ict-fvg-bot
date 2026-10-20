// 24/09/2026 US100 : où est le stop 30 245 du trade d'Esdras ? Quelle bougie M15 porte ce plus bas ?
// Et re-simulation du setup avec ce stop réel. Lancer : node scripts/research-fvg-esdras/exp-2409-stop.mjs
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).href;
const { OFF } = await import(R + 'scripts/lib/m1Data.js');
const { buildContext } = await import(R + 'scripts/lib/fvgGaucheV2.js');
const DIR = 'data/esdras-examples/';
const load = (sym) => JSON.parse(fs.readFileSync(`${DIR}live-${sym}.json`, 'utf8')).candles.slice(0, -1).map((c) => ({ time: c.time - OFF, open: c.open, high: c.high, low: c.low, close: c.close }));
const { bars, zones } = buildContext(load('US100'));
const hm = (t) => new Date(t + OFF).toISOString().slice(5, 16).replace('T', ' ');
const f = (x) => x.toFixed(2);
const z = zones.find((x) => x.dir > 0 && Math.abs(bars[x.k1].time - (Date.parse('2026-09-24T13:45:00Z') - OFF)) < 900000);
console.log(`Zone d'entrée trouvée : ${f(z.inf)}-${f(z.sup)} (k1 = ${hm(bars[z.k1].time)}), entrée = bord proximal ${f(z.sup)}\n`);
console.log('Les trois bougies du FVG et les deux suivantes :');
for (let j = z.k1 - 2; j <= z.k1 + 3; j++) {
  const c = bars[j];
  const tag = j === z.k1 ? '  <- 3e bougie (clôture du FVG)' : j === z.k1 + 1 ? '  <- bougie suivante (validité)' : '';
  console.log(`  ${hm(c.time)} UTC  O ${f(c.open)}  H ${f(c.high)}  L ${f(c.low)}  C ${f(c.close)}${tag}`);
}
let argmin = Infinity, kmin = -1;
for (let j = z.k1 - 2; j <= z.k1 + 1; j++) if (bars[j].low < argmin) { argmin = bars[j].low; kmin = j; }
console.log(`\nPlus bas des bougies du FVG et de la suivante : ${f(argmin)} le ${hm(bars[kmin].time)} (bougie k${kmin - (z.k1 - 2)})`);
console.log(`Stop annoncé par Esdras : 30 245.00 -> écart ${(argmin - 30245).toFixed(2)} pts sous le plus bas.`);

// re-simulation avec le stop réel
const entry = z.sup, stop = 30245, target = 30531.40;
let fill = -1;
for (let i = z.k1 + 2; i < z.k1 + 98 && fill < 0; i++) if (bars[i].low <= entry) fill = i;
console.log(`\nSimulation avec le stop réel : LIMIT ${f(entry)}`);
if (fill < 0) console.log('  jamais rempli');
else {
  let hitT = false, hitS = false, mfe = 0, tT = null, tS = null;
  for (let j = fill; j < Math.min(bars.length, fill + 96); j++) {
    const d = bars[j];
    mfe = Math.max(mfe, d.high - entry);
    if (!hitT && d.high >= target) { hitT = true; tT = d.time; }
    if (!hitS && d.low <= stop) { hitS = true; tS = d.time; break; }
  }
  console.log(`  rempli à ${hm(bars[fill].time)} | pire excursion +${mfe.toFixed(0)} pts`);
  console.log(`  cible ${f(target)} : ${hitT ? `atteinte le ${hm(tT)}` : 'jamais atteinte'}`);
  console.log(`  stop ${f(stop)} : ${hitS ? `touché le ${hm(tS)}` : 'jamais touché'}`);
  const gain = entry - stop;
  console.log(`  risque ${f(gain)} pts pour 1R ; si la cible était atteinte : ${((target - entry) / gain).toFixed(2)} R`);
  console.log(`  issue : ${hitT && !hitS ? 'GAGNANT' : hitS ? 'PERDANT' : 'ni stop ni cible (timeout)'}`);
}
// et les autres bottoms de la journée
console.log('\nPour mémoire, les plus bas du 24/09 après 13:45 :');
for (let j = z.k1 + 2; j < z.k1 + 40; j++) {
  if (bars[j].low < 30300) console.log(`  ${hm(bars[j].time)} UTC  L ${f(bars[j].low)}`);
}