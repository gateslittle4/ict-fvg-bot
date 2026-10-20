import { loadAll } from './comboF.mjs';
import { runYearTRaw } from './comboT.mjs';
import { h4Sweeps } from './lib/krysBacktest.js';
import { nyHour } from './lib/krysMethod.js';
// Usage : node chk_balayage_signal.mjs <data> <année:indice de pose> (ex. 2017:123456) : montre quel low H4 F2 a considéré comme balayé pour un signal.
const [Y, pidx] = process.argv[3].split(':').map(Number);
const all = loadAll(), run = runYearTRaw(all, Y, {}), c = run.c, t = run.T.find((x) => x.placedIdx === pidx);
const sw = h4Sweeps(c, 6), li = sw.lastLow[t.zCreated];
const hh = (i) => { const d = new Date((c[i].t - 5 * 3600) * 1000); return d.toISOString().slice(0, 16).replace('T', ' '); };
console.log('placé', hh(pidx), '| zone créée (c3)', hh(t.zCreated), '| balayage du low H4 à la bougie', hh(li), 'bougies avant c3 :', t.zCreated - li);
// reconstruit les 6 barres H4 complètes avant la bougie li
const key4 = (x) => Math.floor((x.t - 5 * 3600) / 14400), cur = key4(c[li]); const H = new Map();
for (let i = li - 400; i < li; i++) { const k = key4(c[i]); if (k >= cur) continue; const b = H.get(k) || { k, l: Infinity, h: -Infinity, t0: c[i].t }; b.l = Math.min(b.l, c[i].l); b.h = Math.max(b.h, c[i].h); H.set(k, b); }
const bars = [...H.values()].slice(-6); bars.forEach((b) => console.log('barre H4 de', new Date((b.t0 - 5 * 3600) * 1000).toISOString().slice(0, 16).replace('T', ' '), 'bas', b.l.toFixed(1)));
console.log('plus bas des 6 barres :', Math.min(...bars.map((b) => b.l)).toFixed(1), '| bas de la bougie M15 de balayage :', c[li].l.toFixed(1));
