// Pénétration de la bougie suivante dans le dernier FVG brut : tes 11 entrées (valides) contre le micro-FVG écarté du 11 sept.
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).href;
const { OFF } = await import(R + 'scripts/lib/m1Data.js');
const { buildContext } = await import(R + 'scripts/lib/fvgGaucheV2.js');
const DIR = 'data/esdras-examples/';
const load = (sym) => JSON.parse(fs.readFileSync(`${DIR}live-${sym}.json`, 'utf8')).candles.slice(0, -1).map((c) => ({ time: c.time - OFF, open: c.open, high: c.high, low: c.low, close: c.close }));
const CTX = { US100: buildContext(load('US100')), US500: buildContext(load('US500')) };
const day = (s) => Date.parse(s + 'T00:00:00Z') - OFF;
const hm = (eng) => new Date(eng + OFF).toLocaleString('fr-CA', { timeZone: 'America/Port-au-Prince', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const EX = [
  { n: '1 US100 14/09', sym: 'US100', dir: 1, lo: 28840, hi: 28925, from: '2026-09-13', to: '2026-09-16' },
  { n: '2 US100 18/09', sym: 'US100', dir: -1, lo: 29600, hi: 29660, from: '2026-09-17', to: '2026-09-19' },
  { n: '3 US100 23/09', sym: 'US100', dir: -1, lo: 30705, hi: 30790, from: '2026-09-22', to: '2026-09-24' },
  { n: '4 US100 22/09', sym: 'US100', dir: 1, lo: 30500, hi: 30555, from: '2026-09-21', to: '2026-09-23' },
  { n: '5 US100 24/09', sym: 'US100', dir: 1, lo: 30240, hi: 30300, from: '2026-09-23', to: '2026-09-25' },
  { n: '6 US500 29/09', sym: 'US500', dir: -1, lo: 7696, hi: 7704, from: '2026-09-28', to: '2026-09-30' },
  { n: '7a US500 11/09', sym: 'US500', dir: 1, lo: 7626, hi: 7637, from: '2026-09-10', to: '2026-09-12' },
  { n: '7b US500 11/09', sym: 'US500', dir: 1, lo: 7618, hi: 7628, from: '2026-09-10', to: '2026-09-12' },
  { n: '8 US500 14/09', sym: 'US500', dir: 1, lo: 7598, hi: 7612, from: '2026-09-13', to: '2026-09-16' },
  { n: '9 US500 18/09', sym: 'US500', dir: -1, lo: 7658, hi: 7672, from: '2026-09-17', to: '2026-09-19' },
  { n: '10 US500 23/09', sym: 'US500', dir: -1, lo: 7736, hi: 7750, from: '2026-09-22', to: '2026-09-24' },
];
function pen(bars, z) {
  const k = z.k1, nb = bars[k + 1];
  const rawInf = z.dir < 0 ? bars[k].high : bars[k - 2].high, rawSup = z.dir < 0 ? bars[k - 2].low : bars[k].low, h = rawSup - rawInf;
  const p = z.dir < 0 ? Math.max(0, nb.high - rawInf) / h : Math.max(0, rawSup - nb.low) / h;
  const closeIn = z.dir < 0 ? nb.close >= rawInf : nb.close <= rawSup;
  return { p, closeIn, h };
}
console.log('Pénétration de la bougie suivante dans le dernier FVG (0 % = reste dehors, 100 % = comble tout le FVG), par zone d\'entrée candidate :');
for (const ex of EX) {
  const ctx = CTX[ex.sym], { bars, zones } = ctx;
  const rows = [];
  for (const z of zones) {
    if (z.dir !== ex.dir) continue;
    const t = bars[z.k1].time;
    if (t < day(ex.from) || t >= day(ex.to) || !(z.inf <= ex.hi && z.sup >= ex.lo)) continue;
    const r = pen(bars, z);
    rows.push(`${z.inf.toFixed(0)}-${z.sup.toFixed(0)} (${hm(bars[z.k1].time)}) : ${(100 * r.p).toFixed(0)} %${r.closeIn ? ' clôture dedans' : ''}`);
  }
  console.log(`${ex.n.padEnd(16)} ${rows.join(' | ')}`);
}
// le micro-FVG baissier écarté du 11 sept. (US500) : zone 7643.8-7644.1 formée vers 07:15 Haïti
const ctx = CTX.US500;
for (const z of ctx.zones) {
  if (z.dir < 0 && Math.abs(z.inf - 7643.8) < 0.2 && Math.abs(z.sup - 7644.1) < 0.2) { const r = pen(ctx.bars, z); console.log(`\nMicro-FVG écarté ${z.inf.toFixed(1)}-${z.sup.toFixed(1)} (${hm(ctx.bars[z.k1].time)}) : pénétration ${(100 * r.p).toFixed(0)} %${r.closeIn ? ', clôture dedans' : ''}, hauteur ${r.h.toFixed(2)} pt`); }
}
