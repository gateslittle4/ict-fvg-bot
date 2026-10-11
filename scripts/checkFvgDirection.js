#!/usr/bin/env node
// checkFvgDirection.js - descriptif (entraînement 2010-2022 seulement) : la direction du FVG valide le plus récent prédit-elle le prix ? Usage : node scripts/checkFvgDirection.js
// La direction du FVG valide le plus récent est-elle porteuse d'information ? (2010-2022, entraînement seulement, descriptif)
// Pour chaque zone active : rendement signé (dans le sens du FVG) de la clôture de la bougie de confirmation jusqu'à +1, +4, +16, +96 bougies M15,
// comparé à ce que ferait une direction tirée au hasard (tendance de fond des indices comprise) ; puis premier passage à ±0,2 % dans les 96 bougies.
import { eng, loadM1, toM15 } from './lib/m1Data.js';
import { buildZones } from './lib/fvgFollow.js';
const M15 = 900000;
const HZ = [1, 4, 16, 96];
const PERIODS = [['2010-2016', eng(2010), eng(2017)], ['2017-2022', eng(2017), eng(2023)]];
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const res = {};
for (const sym of ['US100', 'US500']) {
  const S = loadM1('hist', sym); const bars = toM15(S);
  const zones = buildZones(bars);
  // rendement futur de chaque bougie (base de comparaison : direction tirée au hasard)
  const fwd = (k, h) => { const j = k + h; if (j >= bars.length || bars[j].time - bars[k].time > h * M15 * 1.6) return null; return (bars[j].close - bars[k].close) / bars[k].close * 1e4; };
  for (const [lab, a, b] of PERIODS) {
    for (const h of HZ) {
      const sig = [], allRet = [];
      for (let k = 0; k < bars.length - h; k += 4) { if (bars[k].time < a || bars[k].time >= b) continue; const r = fwd(k, h); if (r !== null) allRet.push(r); }
      const base = mean(allRet), upShare = allRet.filter((x) => x > 0).length / (allRet.length || 1);
      for (const z of zones) {
        if (z.T < a || z.T >= b) continue;
        const r = fwd(z.kT, h); if (r === null) continue;
        sig.push({ s: z.dir * r, ex: z.dir * (r - base), win: z.dir > 0 ? r > 0 : r < 0, baseWin: z.dir > 0 ? upShare : 1 - upShare });
      }
      const key = `${sym} ${lab} +${h * 15} min`;
      res[key] = { n: sig.length, hit: mean(sig.map((x) => +x.win)), baseHit: mean(sig.map((x) => x.baseWin)), mean: mean(sig.map((x) => x.s)), excess: mean(sig.map((x) => x.ex)), t: mean(sig.map((x) => x.ex)) / (sd(sig.map((x) => x.ex)) / Math.sqrt(sig.length || 1)) };
    }
  }
}
console.log('Direction du FVG valide le plus récent : le prix va-t-il dans son sens ? (hit = part des zones où le prix a bougé dans le sens du FVG ; « hasard » = ce que donnerait une direction tirée au hasard)');
console.log('Paire / période / horizon | zones | hit | hasard | rendement signé (bps) | excès sur le hasard (bps) | t');
for (const [k, v] of Object.entries(res)) console.log(`${k.padEnd(28)} | ${String(v.n).padStart(5)} | ${(100 * v.hit).toFixed(1)} % | ${(100 * v.baseHit).toFixed(1)} % | ${v.mean.toFixed(2).padStart(6)} | ${v.excess.toFixed(2).padStart(6)} | ${v.t.toFixed(2)}`);
