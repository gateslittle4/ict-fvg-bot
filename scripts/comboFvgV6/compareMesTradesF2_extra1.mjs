import fs from 'node:fs';
import { loadAll } from './comboF.mjs';
import { parseCsv, addR } from './analyseMesTrades.mjs';
import { runYearLogged, classify, candleOf } from './compareMesTradesF2.mjs';
const all = loadAll(), f = '/mnt/user-data/uploads/ict-fvg-bot/data/real-trades-2025.csv', raw = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/), H = raw[0].split(',');
const T = parseCsv(fs.readFileSync(f, 'utf8')); raw.slice(1).forEach((l, n) => { T[n].open_price = +l.split(',')[H.indexOf('open_price')]; }); addR(T);
const b = runYearLogged(all, 2025, 1), s = runYearLogged(all, 2025, -1);
for (const t of T) t.cl = classify(t, t.side === 'Buy' ? b : s);
const cd = T.filter((t) => t.cl.C || t.cl.D).sort((a, c) => c.usd - a.usd);
console.log('niveau C ou D, triés par $ :', cd.map((t) => `${t.open.slice(5)} ${t.side[0]} ${t.usd.toFixed(0)}`).join(' | '));
const tot = cd.reduce((a, t) => a + t.usd, 0); console.log('total', tot.toFixed(0), '| sans les 3 plus gros', (tot - cd.slice(0, 3).reduce((a, t) => a + t.usd, 0)).toFixed(0), '| médiane $', cd.map((t) => t.usd).sort((x, y) => x - y)[Math.floor(cd.length / 2)].toFixed(1));
// trades F2 achats remplis : R individuels pris / pas pris + taux de correspondance par hasard (décalage de ses heures de 1 à 20 jours ouvrés)
const c = b.c, nyMs = (k) => (k.t - 5 * 3600) * 1000, herMs = (s2) => Date.parse(s2.replace(' ', 'T') + ':00Z');
const buys = T.filter((t) => t.side === 'Buy'), d0 = '2025-03-07', d1 = '2025-07-30';
const F = b.T.filter((t) => { const d = new Date(nyMs(c[t.fillIdx])).toISOString().slice(0, 10); return d >= d0 && d <= d1; });
const hit = (shift) => F.filter((x) => buys.some((t) => Math.abs(herMs(t.open) + shift * 86400000 - nyMs(c[x.fillIdx])) <= 3600000 && Math.abs(t.open_price - x.entry) <= 0.001 * x.entry)).length;
console.log('trades F2', F.length, '| correspondances réelles', hit(0));
const sh = []; for (const d of [-20, -15, -10, -7, -5, -3, 3, 5, 7, 10, 15, 20]) sh.push(hit(d)); console.log('correspondances si tes heures étaient décalées de ±3 à 20 jours (prix identiques, même heure) :', sh.join(','));
