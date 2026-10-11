import fs from 'node:fs';
const R = new URL('../../', import.meta.url).href;
const { OFF } = await import(R + 'scripts/lib/m1Data.js');
const { buildZones } = await import(R + 'scripts/lib/fvgFollow.js');
const DIR = 'data/esdras-examples/';
const load = (sym) => JSON.parse(fs.readFileSync(`${DIR}live-${sym}.json`, 'utf8')).candles.slice(0, -1).map((c) => ({ time: c.time - OFF, open: c.open, high: c.high, low: c.low, close: c.close }));
const ZONES = { US100: buildZones(load('US100')), US500: buildZones(load('US500')) };
const day = (s) => Date.parse(s + 'T00:00:00Z') - OFF;
const hm = (eng) => new Date(eng + OFF).toLocaleString('fr-CA', { timeZone: 'America/Port-au-Prince', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const EX = [
  ['1 US100 14/09', 'US100', 1, 28840, 28925, '2026-09-13', '2026-09-16'], ['2 US100 18/09', 'US100', -1, 29600, 29660, '2026-09-17', '2026-09-19'],
  ['3 US100 23/09', 'US100', -1, 30705, 30790, '2026-09-22', '2026-09-24'], ['4 US100 22/09', 'US100', 1, 30500, 30555, '2026-09-21', '2026-09-23'],
  ['5 US100 24/09', 'US100', 1, 30240, 30300, '2026-09-23', '2026-09-25'], ['6 US500 29/09', 'US500', -1, 7696, 7704, '2026-09-28', '2026-09-30'],
  ['7a US500 11/09', 'US500', 1, 7626, 7637, '2026-09-10', '2026-09-12'], ['7b US500 11/09', 'US500', 1, 7618, 7628, '2026-09-10', '2026-09-12'],
  ['8 US500 14/09', 'US500', 1, 7598, 7612, '2026-09-13', '2026-09-16'], ['9 US500 18/09', 'US500', -1, 7658, 7672, '2026-09-17', '2026-09-19'],
  ['10 US500 23/09', 'US500', -1, 7736, 7750, '2026-09-22', '2026-09-24'],
];
let ok = 0;
for (const [n, sym, dir, lo, hi, from, to] of EX) {
  const zs = ZONES[sym].filter((z) => z.dir === dir && z.T >= day(from) && z.T < day(to) && z.remInf <= hi && z.remSup >= lo);
  if (zs.length) ok++;
  console.log(`${n.padEnd(16)} ${zs.length ? '✅' : '❌'} ${zs.map((z) => `${z.remInf.toFixed(1)}-${z.remSup.toFixed(1)} active ${hm(z.T)} Haïti`).slice(0, 3).join(' | ') || 'aucune zone dans ton sens sur ta boîte'}`);
}
console.log(`\nZone de ton sens retrouvée sur ta boîte : ${ok}/11`);
