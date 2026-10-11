// Sur les 11 exemples : quelle règle de choix du 4hr low/high retrouve le bloc H4 de la ligne d'Esdras ? (détection seulement)
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
const isPivot = (blocks, b, short) => {
  const B = blocks[b], ext = short ? B.low : B.high;
  for (const d of [-1, 1]) { const O = blocks[b + d]; if (!O || O.id !== B.id + d) continue; if (short ? !(ext < O.low) : !(ext > O.high)) return false; }
  return true;
};
const rules = {
  'pivot récent': (c, short) => c.filter((x) => x.pivot).sort((p, q) => q.b - p.b)[0],
  'plus proche': (c, short) => c.sort((p, q) => (short ? q.ext - p.ext : p.ext - q.ext))[0],
  'plus extrême 24 h': (c, short) => c.filter((x) => x.age <= 6).sort((p, q) => (short ? p.ext - q.ext : q.ext - p.ext))[0],
  'plus extrême 72 h': (c, short) => c.filter((x) => x.age <= 18).sort((p, q) => (short ? p.ext - q.ext : q.ext - p.ext))[0],
  'plus récent (sans pivot)': (c, short) => c.sort((p, q) => q.b - p.b)[0],
};
const score = Object.fromEntries(Object.keys(rules).map((k) => [k, []]));
for (const ex of EX) {
  const ctx = CTX[ex.sym], { bars, blocks, blockOf } = ctx;
  const seen = {}; let nZones = 0, anyBlock = false;
  for (const z of ctx.zones) {
    if (z.dir !== ex.dir) continue;
    const t = bars[z.k1].time;
    if (t < day(ex.from) || t >= day(ex.to) || !(z.inf <= ex.hi && z.sup >= ex.lo)) continue;
    nZones++;
    const kT = z.k1 + 1, short = z.dir < 0, entry = short ? z.inf : z.sup;
    const cands = []; let age = 0;
    for (let b = blockOf[kT]; b >= 0 && age < 30; b--) {
      const B = blocks[b];
      if (B.end > kT) continue;
      age++;
      const ext = short ? B.low : B.high;
      if (short ? !(B.low < entry && B.sweepLow > kT) : !(B.high > entry && B.sweepHigh > kT)) continue;
      cands.push({ b, ext, age, pivot: isPivot(blocks, b, short) && (b + 1 < blocks.length && blocks[b + 1].end <= kT) });
    }
    if (cands.some((c) => Math.abs(c.ext - ex.line) <= ex.tol)) anyBlock = true;
    for (const [k, f] of Object.entries(rules)) {
      const pick = f([...cands], short);
      if (pick && Math.abs(pick.ext - ex.line) <= ex.tol) seen[k] = true;
    }
  }
  const row = Object.keys(rules).map((k) => { score[k].push(!!seen[k]); return `${k}: ${seen[k] ? 'oui' : 'non'}`; });
  console.log(`${ex.n.padEnd(16)} zones ${nZones} | ligne dans les candidats : ${anyBlock ? 'oui' : 'NON'} | ${row.join(' | ')}`);
}
console.log('\nScore par règle (11 exemples) :');
for (const [k, v] of Object.entries(score)) console.log(`  ${k.padEnd(26)} ${v.filter(Boolean).length}/11  (6 premiers : ${v.slice(0, 6).filter(Boolean).length}/6, 5 nouveaux : ${v.slice(6).filter(Boolean).length}/5)`);
