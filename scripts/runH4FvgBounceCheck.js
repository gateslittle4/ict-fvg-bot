// Descriptif, exploration 2011-2018 : une fois le FVG H4 rempli (milieu ou fond), le prix repart-il dans le sens du FVG ?
// Course depuis le moment du remplissage : +1 hauteur de zone dans le sens du FVG (rebond) contre -1 hauteur (le prix continue).
// Aussi +2 hauteurs contre -1. Placebo : même taille, même sens, zone fictive au prix d'un moment tiré au hasard, même déroulé.
import { loadPhase } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
const H = 30 * 4 * 60;
let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (const sym of ['US100', 'US500', 'XAUUSD']) {
  const S = loadPhase(sym, 'explore'), X = buildContext(S), b4 = X.b4h;
  // à partir de i, premier moment où le prix atteint le niveau L (sens dir = sens du remplissage)
  const reach = (i, L, dir) => { for (let k = i; k < Math.min(S.n, i + H); k++) if (dir < 0 ? S.l[k] <= L : S.h[k] >= L) return k; return -1; };
  // course depuis k au prix L : up = +m*h dans le sens du FVG (fd), down = -h
  const race = (k, L, h, fd, m) => { for (let q = k + 1; q < Math.min(S.n, k + H); q++) { const bad = fd > 0 ? S.l[q] <= L - h : S.h[q] >= L + h; const good = fd > 0 ? S.h[q] >= L + m * h : S.l[q] <= L - m * h; if (bad) return 0; if (good) return 1; } return null; };
  const acc = { real: { mid: [[], []], full: [[], []] }, fake: { mid: [[], []], full: [[], []] } };
  const run = (tag, i, top, bot, fd) => {
    const h = top - bot, dir = -fd;
    for (const [lvl, L] of [['mid', (top + bot) / 2], ['full', fd > 0 ? bot : top]]) {
      const k = reach(i, L, dir); if (k < 0) continue;
      [1, 2].forEach((m, idx) => { const r = race(k, L, h, fd, m); if (r !== null) acc[tag][lvl][idx].push(r); });
    }
  };
  for (const z of X.fvg[2]) {
    if (b4[z.k].t < Date.UTC(2011, 0, 1) - 5 * 3600000 || z.touch === Infinity) continue;
    const tb = b4[z.touch]; let i = tb.i0; for (; i <= tb.i1; i++) if (z.dir > 0 ? S.l[i] <= z.top : S.h[i] >= z.bot) break;
    const h = z.top - z.bot; if (!(h > 0)) continue;
    run('real', i, z.top, z.bot, z.dir);
    const j = Math.floor(rnd() * (S.n - 2 * H)), p = S.o[j];
    run('fake', j, z.dir > 0 ? p : p + h, z.dir > 0 ? p - h : p, z.dir);
  }
  const pc = (a) => `${Math.round(100 * a.reduce((s, x) => s + x, 0) / a.length)} % (${a.length})`;
  for (const lvl of ['mid', 'full']) console.log(`${sym} après remplissage ${lvl === 'mid' ? 'à moitié' : 'complet'} : rebond d'1 zone avant -1 zone ${pc(acc.real[lvl][0])} vs hasard ${pc(acc.fake[lvl][0])} | rebond de 2 zones avant -1 zone ${pc(acc.real[lvl][1])} vs hasard ${pc(acc.fake[lvl][1])}`);
}
