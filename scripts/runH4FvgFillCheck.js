// Descriptif, exploration 2011-2018 seulement : quand le prix touche un FVG H4, va-t-il jusqu'au milieu / au fond de la zone avant de
// repartir d'une hauteur de zone dans l'autre sens ? Comparé à des zones fictives de même taille posées au hasard (placebo).
import { loadPhase, nyMin } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
const HORIZON = 30 * 4 * 60; // 5 jours de minutes
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (const sym of ['US100', 'US500', 'XAUUSD']) {
  const S = loadPhase(sym, 'explore'), X = buildContext(S), b4 = X.b4h;
  // course depuis la minute i, prix de départ p (bord de zone), dir = sens du remplissage (-1 = vers le bas pour un FVG haussier)
  const race = (i, p, h, dir) => {
    let mid = null, full = null;
    for (let k = i; k < Math.min(S.n, i + HORIZON); k++) {
      const away = dir < 0 ? S.h[k] >= p + h : S.l[k] <= p - h;
      const reachMid = dir < 0 ? S.l[k] <= p - h / 2 : S.h[k] >= p + h / 2;
      const reachFull = dir < 0 ? S.l[k] <= p - h : S.h[k] >= p + h;
      if (mid === null && reachMid) mid = true;
      if (full === null && reachFull) full = true;
      if (away) { if (mid === null) mid = false; if (full === null) full = false; break; }
      if (mid !== null && full !== null) break;
    }
    return { mid: !!mid, full: !!full };
  };
  const real = [], fake = [];
  for (const z of X.fvg[2]) {
    if (b4[z.k].t < Date.UTC(2011, 0, 1) - 5 * 3600000) continue;
    if (z.touch === Infinity) continue;
    const tb = b4[z.touch];
    // minute du premier contact dans la bougie H4 de contact
    let i = tb.i0; for (; i <= tb.i1; i++) if (z.dir > 0 ? S.l[i] <= z.top : S.h[i] >= z.bot) break;
    const h = z.top - z.bot; if (!(h > 0)) continue;
    const p = z.dir > 0 ? z.top : z.bot, dir = z.dir > 0 ? -1 : 1;
    real.push(race(i, p, h, dir));
    // placebo : même taille, même sens, moment tiré au hasard, zone qui commence au prix de ce moment
    const j = Math.floor(rnd() * (S.n - HORIZON));
    fake.push(race(j, S.o[j], h, dir));
  }
  const pc = (a, k) => Math.round(100 * a.filter((x) => x[k]).length / a.length);
  console.log(`${sym} : ${real.length} FVG H4 touchés (2011-2018) | atteint le MILIEU avant de repartir : ${pc(real, 'mid')} % (hasard ${pc(fake, 'mid')} %) | rempli JUSQU'AU FOND : ${pc(real, 'full')} % (hasard ${pc(fake, 'full')} %)`);
}
