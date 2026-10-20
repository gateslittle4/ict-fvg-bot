// Détail du 24/09/2026 sur US100 : tous les setups de la chaîne complète, avec ce que le prix a fait ensuite (cible atteinte ? stop ? MFE ?).
// Et pour chaque trade d'Esdras dessiné : la zone, la ligne 4hr et la cible. Lancer : node scripts/research-fvg-esdras/exp-2409.mjs
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).href;
const { OFF } = await import(R + 'scripts/lib/m1Data.js');
const { buildContext } = await import(R + 'scripts/lib/fvgGaucheV2.js');
const DIR = 'data/esdras-examples/';
const load = (sym) => JSON.parse(fs.readFileSync(`${DIR}live-${sym}.json`, 'utf8')).candles.slice(0, -1).map((c) => ({ time: c.time - OFF, open: c.open, high: c.high, low: c.low, close: c.close }));
const ctx = buildContext(load('US100'));
const { bars, zones, blocks, blockOf } = ctx;
const DAY = Date.parse('2026-09-24T00:00:00Z') - OFF;
const hm = (t) => new Date(t + OFF).toISOString().slice(5, 16).replace('T', ' ');
const f = (x) => x.toFixed(2);
function penet(z) {
  const k = z.k1, nb = bars[k + 1];
  if (!nb) return Infinity;
  const rawInf = z.dir < 0 ? bars[k].high : bars[k - 2].high, rawSup = z.dir < 0 ? bars[k - 2].low : bars[k].low;
  return (z.dir < 0 ? Math.max(0, nb.high - rawInf) : Math.max(0, rawSup - nb.low)) / (rawSup - rawInf);
}
for (const z of zones) z.valid = penet(z) <= 0.5;
const isPivot = (b, short, kT) => {
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
function leftEdge(z, B, kT) {
  const short = z.dir < 0, entry = short ? z.inf : z.sup;
  let best = null;
  for (const L of B.zones) {
    if (L.dir !== -z.dir || L.filled <= kT || L.k1 >= z.k0 - 2) continue;
    let edge = short ? L.sup : L.inf;
    for (let j = L.k1 + 1; j <= kT; j++) edge = short ? Math.min(edge, bars[j].low) : Math.max(edge, bars[j].high);
    if (short ? !(edge < entry) : !(edge > entry)) continue;
    if (!best || (short ? edge > best.edge : edge < best.edge)) best = { edge, L };
  }
  return best;
}
function alertsOf(z) {
  const kT = z.k1 + 1, short = z.dir < 0, entry = short ? z.inf : z.sup;
  if (kT >= bars.length) return [];
  const cands = []; let age = 0;
  for (let b = blockOf[kT]; b >= 0 && age < 30; b--) {
    const B = blocks[b]; if (B.end > kT) continue; age++;
    if (short ? !(B.low < entry && B.sweepLow > kT) : !(B.high > entry && B.sweepHigh > kT)) continue;
    cands.push({ b, B, ext: short ? B.low : B.high, age, pivot: isPivot(b, short, kT) });
  }
  const seen = new Map();
  for (const [name, fn] of Object.entries(RULES)) { const p = fn([...cands], short); if (p && !seen.has(p.b)) seen.set(p.b, { ...p, rule: name }); }
  const out = [];
  for (const p of seen.values()) { const le = leftEdge(z, p.B, kT); if (le) out.push({ line: p.ext, rule: p.rule, target: le.edge }); }
  return out;
}
/** Suit un LIMIT posé à l'entrée : rempli ? cible atteinte ? pire excursion ? */
function follow(z, line, target) {
  const buy = z.dir > 0, entry = buy ? z.sup : z.inf, stop = buy ? z.inf - 10 : z.sup + 10;
  const k0 = z.k1 + 2;
  for (let i = k0; i < Math.min(bars.length, k0 + 96); i++) {
    const c = bars[i];
    if (buy ? c.low <= entry : c.high >= entry) {
      let mfe = 0, hitT = false, hitS = false;
      for (let j = i; j < Math.min(bars.length, i + 96); j++) {
        const d = bars[j];
        const up = (d.high - entry), dn = (entry - d.low);
        mfe = buy ? Math.max(mfe, up) : Math.max(mfe, dn);
        if (!hitT && (buy ? d.high >= target : d.low <= target)) hitT = true;
        if (!hitS && (buy ? d.low <= stop : d.high >= stop)) { hitS = true; break; }
      }
      return { fill: c.time, entry, target, stop, hitT, hitS, mfe };
    }
  }
  return null;
}
const day = zones.filter((z) => bars[z.k1].time >= DAY && bars[z.k1].time < DAY + 86400000);
console.log(`US100 — 24/09/2026 (UTC) : ${day.length} zones FVG M15 non mitigées formées ce jour, dont ${day.filter((z) => z.valid).length} valides.\n`);
let n = 0;
for (const z of day) {
  const al = z.valid ? alertsOf(z) : [];
  if (!al.length) continue;
  n++;
  const buy = z.dir > 0, entry = buy ? z.sup : z.inf;
  console.log(`Setup ${n} — ${hm(bars[z.k1].time)} UTC, ${buy ? 'ACHAT' : 'VENTE'}, zone ${f(z.inf)}-${f(z.sup)} (partie non mangée), entrée ${f(entry)}`);
  for (const a of al) {
    const sim = follow(z, a.line, a.target);
    console.log(`   ligne 4hr ${f(a.line)} (règle ${a.rule}) | cible ${f(a.target)}`);
    console.log(`   → ${sim ? `LIMIT rempli à ${f(sim.entry)} le ${hm(sim.fill)} | cible atteinte : ${sim.hitT ? 'OUI' : 'non'} | stop touché : ${sim.hitS ? 'OUI' : 'non'} | pire excursion ${sim.mfe.toFixed(0)} pts` : 'jamais rempli'}`);
  }
  console.log('');
}
console.log('Ce qu\'Esdras a dessiné le 24/09 : ACHAT, entrée 30 250-30 290, ligne 4hr = 30 570, pas de FVG à gauche encadré.');