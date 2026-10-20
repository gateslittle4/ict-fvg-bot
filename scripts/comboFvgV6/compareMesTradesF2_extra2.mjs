import fs from 'node:fs';
import { loadAll } from './comboF.mjs';
import { runYearLogged } from './compareMesTradesF2.mjs';
const all = loadAll(), f = '/mnt/user-data/uploads/ict-fvg-bot/data/real-trades-2025.csv', raw = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/), H = raw[0].split(',');
const buys = raw.slice(1).map((l) => l.split(',')).filter((p) => p[H.indexOf('side')] === 'Buy').map((p) => ({ ms: Date.parse(p[0].replace(' ', 'T') + ':00Z'), px: +p[H.indexOf('open_price')] }));
const b = runYearLogged(all, 2025, 1), c = b.c, nyMs = (k) => (k.t - 5 * 3600) * 1000;
const F = b.T.filter((t) => { const d = new Date(nyMs(c[t.fillIdx])).toISOString().slice(0, 10); return d >= '2025-03-07' && d <= '2025-07-30'; });
const tk = F.filter((x) => buys.some((t) => Math.abs(t.ms - nyMs(c[x.fillIdx])) <= 3600000 && Math.abs(t.px - x.entry) <= 0.001 * x.entry)), nt = F.filter((x) => !tk.includes(x));
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length, R = (a) => a.map((x) => +x.r.toFixed(2));
console.log('pris', R(tk).join(' '), '| pas pris', R(nt).join(' '));
console.log('F2 tous', F.length, 'R moy', avg(F.map((x) => x.r)).toFixed(3), '| pris', avg(tk.map((x) => x.r)).toFixed(3), '| pas pris', avg(nt.map((x) => x.r)).toFixed(3), '| TP pris', tk.filter((x) => x.why === 'tp').length, '/', tk.length, '| TP pas pris', nt.filter((x) => x.why === 'tp').length, '/', nt.length);
// permutation : étiquettes pris/pas pris
const all36 = F.map((x) => x.r), n1 = tk.length, obs = avg(tk.map((x) => x.r)) - avg(nt.map((x) => x.r)); let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let ge = 0; const B = 20000; for (let i = 0; i < B; i++) { const a = all36.slice(); for (let j = a.length - 1; j > 0; j--) { const k = Math.floor(rnd() * (j + 1)); [a[j], a[k]] = [a[k], a[j]]; } if (avg(a.slice(0, n1)) - avg(a.slice(n1)) >= obs) ge++; }
console.log('diff', obs.toFixed(3), 'permutation p (unilatéral)', (ge / B).toFixed(4));
