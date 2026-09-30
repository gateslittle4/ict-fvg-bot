// Chaîne complète avec la règle confirmée (FVG invalide si la bougie suivante pénètre de plus de 50 %) : tes 11 trades sont-ils retrouvés ?
// + volume d'alertes du 9 au 29 sept. (US100 et US500).
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
function penet(bars, z) {
  const k = z.k1, nb = bars[k + 1];
  if (!nb) return Infinity;
  const rawInf = z.dir < 0 ? bars[k].high : bars[k - 2].high, rawSup = z.dir < 0 ? bars[k - 2].low : bars[k].low;
  return (z.dir < 0 ? Math.max(0, nb.high - rawInf) : Math.max(0, rawSup - nb.low)) / (rawSup - rawInf);
}
for (const c of Object.values(CTX)) for (const z of c.zones) z.valid = penet(c.bars, z) <= 0.5;
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
function leftEdge(ctx, z, B, kT) {
  const { bars } = ctx, short = z.dir < 0, entry = short ? z.inf : z.sup;
  let best = null;
  for (const L of B.zones) {
    if (L.dir !== -z.dir || L.filled <= kT || L.k1 >= z.k0 - 2) continue;
    let edge = short ? L.sup : L.inf;
    for (let j = L.k1 + 1; j <= kT; j++) edge = short ? Math.min(edge, bars[j].low) : Math.max(edge, bars[j].high);
    if (short ? !(edge < entry) : !(edge > entry)) continue;
    if (!best || (short ? edge > best.edge : edge < best.edge)) best = { L, edge };
  }
  return best;
}
/** Alertes candidates d'une zone valide : une par ligne 4hr distincte (union des 3 règles) dont la bougie H4 contient un FVG à gauche disponible. */
function alertsOf(ctx, z) {
  const { blocks, blockOf } = ctx, kT = z.k1 + 1, short = z.dir < 0, entry = short ? z.inf : z.sup;
  if (kT >= ctx.bars.length) return [];
  const cands = []; let age = 0;
  for (let b = blockOf[kT]; b >= 0 && age < 30; b--) {
    const B = blocks[b]; if (B.end > kT) continue; age++;
    if (short ? !(B.low < entry && B.sweepLow > kT) : !(B.high > entry && B.sweepHigh > kT)) continue;
    cands.push({ b, B, ext: short ? B.low : B.high, age, pivot: isPivot(blocks, b, short, kT) });
  }
  const seen = new Map();
  for (const f of Object.values(RULES)) { const p = f([...cands], short); if (p && !seen.has(p.b)) seen.set(p.b, p); }
  const out = [];
  for (const p of seen.values()) { const le = leftEdge(ctx, z, p.B, kT); if (le) out.push({ ext: p.ext, target: le.edge }); }
  return out;
}
console.log('Trade                | FVG valide | direction | lignes proposées (bougies H4 avec FVG à gauche) | ta ligne proposée | trade retrouvé');
let found = 0;
for (const ex of EX) {
  const ctx = CTX[ex.sym], { bars, zones } = ctx;
  let s1 = false, hit = false; const lines = new Set(); let dirOk = null;
  for (const z of zones) {
    if (z.dir !== ex.dir || !z.valid) continue;
    const t = bars[z.k1].time;
    if (t < day(ex.from) || t >= day(ex.to) || !(z.inf <= ex.hi && z.sup >= ex.lo)) continue;
    s1 = true;
    const kT = z.k1 + 1, short = z.dir < 0, entry = short ? z.inf : z.sup;
    let j = kT + 1; while (j < bars.length && j < kT + 97 && !(short ? bars[j].high >= entry : bars[j].low <= entry)) j++;
    if (j < bars.length && j < kT + 97) { let nw = null; for (const q of zones) if (q.valid && q.k1 < j && (!nw || q.k1 > nw.k1)) nw = q; if (nw) dirOk = dirOk === true || nw.dir === ex.dir; }
    for (const a of alertsOf(ctx, z)) { lines.add(a.ext.toFixed(1)); if (Math.abs(a.ext - ex.line) <= ex.tol) hit = true; }
  }
  const full = s1 && dirOk && hit;
  if (full) found++;
  console.log(`${ex.n.padEnd(20)} | ${s1 ? '✅' : '❌'}         | ${dirOk === null ? '—' : dirOk ? '✅' : '❌'}        | ${[...lines].join(', ') || 'aucune'}`.padEnd(105) + ` | ${hit ? '✅' : '❌'}                | ${full ? '✅' : '❌'}`);
}
console.log(`\nTrades retrouvés de bout en bout : ${found}/11`);
// Volume d'alertes du 9 au 29 sept. : zones valides avec au moins une ligne 4hr + FVG à gauche
for (const sym of ['US100', 'US500']) {
  const ctx = CTX[sym], { bars, zones } = ctx;
  const a = day('2026-09-09'), b = day('2026-09-30');
  let zonesAlert = 0, lignes = 0; const perDay = new Map();
  for (const z of zones) {
    const t = bars[z.k1].time; if (t < a || t >= b || !z.valid) continue;
    const al = alertsOf(ctx, z); if (!al.length) continue;
    zonesAlert++; lignes += al.length;
    const d = new Date(t + OFF).toISOString().slice(5, 10); perDay.set(d, (perDay.get(d) || 0) + 1);
  }
  const days = [...perDay.values()];
  console.log(`${sym} du 9 au 29 sept. : ${zonesAlert} alertes (zones d'entrée valides avec une ligne 4hr et un FVG à gauche), ${(zonesAlert / 15).toFixed(1)} par jour de bourse (15 jours), max ${Math.max(...days)} en une journée`);
}
