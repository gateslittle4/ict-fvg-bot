// Par jour : combien de setups respectant la chaîne complète (FVG d'entrée valide + ligne 4hr + FVG à gauche) sur les dates des 11 exemples.
// Pour chaque setup listé : heure UTC, sens, zone d'entrée, ligne 4hr, cible, et si la ligne est celle qu'Esdras a dessinée.
// Lancer : node scripts/research-fvg-esdras/exp-par-jour.mjs
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).href;
const { OFF } = await import(R + 'scripts/lib/m1Data.js');
const { buildContext } = await import(R + 'scripts/lib/fvgGaucheV2.js');
const DIR = 'data/esdras-examples/';
const load = (sym) => JSON.parse(fs.readFileSync(`${DIR}live-${sym}.json`, 'utf8')).candles.slice(0, -1).map((c) => ({ time: c.time - OFF, open: c.open, high: c.high, low: c.low, close: c.close }));
const CTX = { US100: buildContext(load('US100')), US500: buildContext(load('US500')) };
const day = (s) => Date.parse(s + 'T00:00:00Z') - OFF;
const hm = (t) => new Date(t + OFF).toISOString().slice(5, 16).replace('T', ' ');
const dstr = (t) => new Date(t + OFF).toISOString().slice(5, 10);
// exemples : date UTC de formation du FVG d'entrée (relevée par exp-gemini.mjs) et ligne 4hr dessinée
const EX = [
  { n: '1', sym: 'US100', dir: 1, day: '09-14', line: 29125, tol: 20 },
  { n: '2', sym: 'US100', dir: -1, day: '09-18', line: 29390, tol: 20 },
  { n: '3', sym: 'US100', dir: -1, day: '09-22', line: 30495, tol: 20 },
  { n: '4', sym: 'US100', dir: 1, day: '09-22', line: 30665, tol: 20 },
  { n: '5', sym: 'US100', dir: 1, day: '09-24', line: 30570, tol: 20 },
  { n: '6', sym: 'US500', dir: -1, day: '09-28', line: 7666, tol: 5 },
  { n: '7a', sym: 'US500', dir: 1, day: '09-11', line: 7694, tol: 5 },
  { n: '7b', sym: 'US500', dir: 1, day: '09-11', line: 7694, tol: 5 },
  { n: '8', sym: 'US500', dir: 1, day: '09-14', line: 7641, tol: 5 },
  { n: '9', sym: 'US500', dir: -1, day: '09-18', line: 7620.5, tol: 5 },
  { n: '10', sym: 'US500', dir: -1, day: '09-23', line: 7703.5, tol: 5 },
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
/** Setups d'une zone : une alerte par ligne 4hr distincte (union des 3 règles) dont la bougie H4 contient un FVG à gauche disponible. */
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
  for (const p of seen.values()) { const le = leftEdge(ctx, z, p.B, kT); if (le) out.push({ ext: p.ext, target: le.edge, rule: Object.entries(RULES).find(([, f]) => { const q = f([...cands], short); return q && q.b === p.b; })[0] }); }
  return out;
}
let grandTotal = 0, matchTotal = 0;
for (const ex of EX) {
  const ctx = CTX[ex.sym], { bars, zones } = ctx;
  const setups = [];
  for (const z of zones) {
    if (!z.valid) continue;
    if (dstr(bars[z.k1].time) !== ex.day) continue;
    for (const a of alertsOf(ctx, z)) setups.push({ z, ...a, match: Math.abs(a.ext - ex.line) <= ex.tol });
  }
  const match = setups.filter((s) => s.match).length;
  grandTotal += setups.length; matchTotal += match;
  console.log(`\nExemple ${ex.n} — ${ex.sym} ${ex.day} ${ex.dir > 0 ? 'achat' : 'vente'}, ta ligne 4hr = ${ex.line}`);
  console.log(`  Setups complets détectés ce jour-là : ${setups.length}   dont la ligne est la tienne : ${match}`);
  for (const s of setups) console.log(`   ${s.match ? '✅' : '  '} ${hm(bars[s.z.k1].time)} UTC ${s.z.dir > 0 ? 'ACHAT' : 'VENTE'} entrée ${s.z.inf}-${s.z.sup} | ligne 4hr ${s.ext} (${s.rule}) | cible ${s.target.toFixed(2)}`);
}
console.log(`\nTotal sur les 11 exemples : ${grandTotal} setups complets, dont ${matchTotal} avec la ligne 4hr d'Esdras.`);