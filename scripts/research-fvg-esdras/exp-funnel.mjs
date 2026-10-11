// Entonnoir de détection sur les 11 exemples : (1) FVG d'entrée retrouvé, (2) direction = celle du FVG le plus récent au moment du retest,
// (3) ligne 4hr retrouvée (règles seules et groupe de 3 règles), (4) FVG « à gauche » présent dans la bougie H4 de la ligne.
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).href;
const { OFF } = await import(R + 'scripts/lib/m1Data.js');
const { buildContext } = await import(R + 'scripts/lib/fvgGaucheV2.js');
const DIR = 'data/esdras-examples/';
const load = (sym) => JSON.parse(fs.readFileSync(`${DIR}live-${sym}.json`, 'utf8')).candles.slice(0, -1).map((c) => ({ time: c.time - OFF, open: c.open, high: c.high, low: c.low, close: c.close }));
const CTX = { US100: buildContext(load('US100')), US500: buildContext(load('US500')) };
const day = (s) => Date.parse(s + 'T00:00:00Z') - OFF;
const EX = [
  { n: '1 US100 14/09', sym: 'US100', dir: 1, lo: 28840, hi: 28925, line: 29125, tol: 20, from: '2026-09-13', to: '2026-09-16' },
  { n: '2 US100 18/09', sym: 'US100', dir: -1, lo: 29600, hi: 29660, line: 29390, tol: 20, from: '2026-09-17', to: '2026-09-19' },
  { n: '3 US100 23/09', sym: 'US100', dir: -1, lo: 30705, hi: 30790, line: 30495, tol: 20, from: '2026-09-22', to: '2026-09-24' },
  { n: '4 US100 22/09', sym: 'US100', dir: 1, lo: 30500, hi: 30555, line: 30665, tol: 20, from: '2026-09-21', to: '2026-09-23' },
  { n: '5 US100 24/09', sym: 'US100', dir: 1, lo: 30240, hi: 30300, line: 30570, tol: 20, from: '2026-09-23', to: '2026-09-25' },
  { n: '6 US500 29/09', sym: 'US500', dir: -1, lo: 7696, hi: 7704, line: 7666, tol: 5, from: '2026-09-28', to: '2026-09-30' },
  { n: '7a US500 11/09', sym: 'US500', dir: 1, lo: 7626, hi: 7637, line: 7694, tol: 5, from: '2026-09-10', to: '2026-09-12' },
  { n: '7b US500 11/09', sym: 'US500', dir: 1, lo: 7618, hi: 7628, line: 7694, tol: 5, from: '2026-09-10', to: '2026-09-12' },
  { n: '8 US500 14/09', sym: 'US500', dir: 1, lo: 7598, hi: 7612, line: 7641, tol: 5, from: '2026-09-13', to: '2026-09-16' },
  { n: '9 US500 18/09', sym: 'US500', dir: -1, lo: 7658, hi: 7672, line: 7620.5, tol: 5, from: '2026-09-17', to: '2026-09-19' },
  { n: '10 US500 23/09', sym: 'US500', dir: -1, lo: 7736, hi: 7750, line: 7703.5, tol: 5, from: '2026-09-22', to: '2026-09-24' },
];
const isPivot = (blocks, b, short, kT) => {
  const B = blocks[b], ext = short ? B.low : B.high;
  if (b + 1 >= blocks.length || blocks[b + 1].end > kT) return false;
  for (const d of [-1, 1]) { const O = blocks[b + d]; if (!O || O.id !== B.id + d) continue; if (short ? !(ext < O.low) : !(ext > O.high)) return false; }
  return true;
};
const RULES = {
  pivot: (c, short) => c.filter((x) => x.pivot).sort((p, q) => q.b - p.b)[0],
  extreme24: (c, short) => c.filter((x) => x.age <= 6).sort((p, q) => (short ? p.ext - q.ext : q.ext - p.ext))[0],
  proche: (c, short) => [...c].sort((p, q) => (short ? q.ext - p.ext : p.ext - q.ext))[0],
};
function leftExists(ctx, z, B, kT) {
  const { bars } = ctx, short = z.dir < 0, entry = short ? z.inf : z.sup;
  for (const L of B.zones) {
    if (L.dir !== -z.dir || L.filled <= kT || L.k1 >= z.k0 - 2) continue;
    let edge = short ? L.sup : L.inf;
    for (let j = L.k1 + 1; j <= kT; j++) edge = short ? Math.min(edge, bars[j].low) : Math.max(edge, bars[j].high);
    if (short ? edge < entry : edge > entry) return true;
  }
  return false;
}
const tot = { s1: 0, s2: 0, s3: 0, s4: 0 };
const mark = (b) => (b ? '✅' : '❌');
console.log('Exemple           | 1 FVG entrée | 2 direction | 3 ligne 4hr (groupe de 3 règles) | 4 FVG à gauche | détail ligne');
for (const ex of EX) {
  const ctx = CTX[ex.sym], { bars, blocks, blockOf, zones } = ctx;
  let s1 = false, s2 = null, s3 = false, s4 = false, note = [];
  for (const z of zones) {
    if (z.dir !== ex.dir) continue;
    const t = bars[z.k1].time;
    if (t < day(ex.from) || t >= day(ex.to) || !(z.inf <= ex.hi && z.sup >= ex.lo)) continue;
    s1 = true;
    const kT = z.k1 + 1, short = z.dir < 0, entry = short ? z.inf : z.sup;
    // 2. FVG le plus récent (toutes directions) au moment du premier retest du bord d'entrée
    let j = kT + 1;
    while (j < bars.length && j < kT + 97 && !(short ? bars[j].high >= entry : bars[j].low <= entry)) j++;
    if (j < bars.length && j < kT + 97) {
      let newest = null; for (const q of zones) if (q.k1 < j && (!newest || q.k1 > newest.k1)) newest = q;
      if (newest) { const ok = newest.dir === ex.dir; s2 = s2 === true ? true : ok; }
    }
    // 3. ligne 4hr : groupe de 3 règles
    const cands = []; let age = 0;
    for (let b = blockOf[kT]; b >= 0 && age < 30; b--) {
      const B = blocks[b];
      if (B.end > kT) continue;
      age++;
      if (short ? !(B.low < entry && B.sweepLow > kT) : !(B.high > entry && B.sweepHigh > kT)) continue;
      cands.push({ b, B, ext: short ? B.low : B.high, age, pivot: isPivot(blocks, b, short, kT) });
    }
    for (const [name, f] of Object.entries(RULES)) {
      const pick = f([...cands], short);
      if (pick && Math.abs(pick.ext - ex.line) <= ex.tol) { s3 = true; note.push(name); if (leftExists(ctx, z, pick.B, kT)) s4 = true; }
    }
  }
  if (s1) tot.s1++; if (s2) tot.s2++; if (s3) tot.s3++; if (s3 && s4) tot.s4++;
  console.log(`${ex.n.padEnd(17)} | ${mark(s1)}           | ${s2 === null ? '—' : mark(s2)}          | ${mark(s3)} ${[...new Set(note)].join('+')}`.padEnd(88) + ` | ${s3 ? mark(s4) : '—'}`);
}
console.log(`\nEntonnoir sur 11 : FVG d'entrée ${tot.s1}/11 → direction du FVG le plus récent ${tot.s2}/11 → ligne 4hr (3 règles) ${tot.s3}/11 → FVG à gauche dans la bougie ${tot.s4}/11`);
