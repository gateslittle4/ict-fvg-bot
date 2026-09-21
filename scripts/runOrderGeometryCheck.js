#!/usr/bin/env node
// runM1ProtocolBacktest.js
// Usage: node --max-old-space-size=4096 scripts/runM1ProtocolBacktest.js
//
// Compare deux GEOMETRIES d'ordre pour le meme combo (M1 reel sans trous, spreads mesures, sans GER40) :
//  A) « backtest » : stop et cible aux niveaux de la strategie (en prix bid), on paie le spread a l'entree : perte -1 - s/d, gain +3 - s/d ;
//  B) « live » : ordre MARKET, stop et cible RELATIFS au prix de remplissage (ask = bid + s) : distance stop en prix bid = d - s, cible = 3d + s,
//     perte exactement -1 R, gain +3 R (voir toRelativeProtectionDistance dans cTraderDataSource.js). Le stop est plus serre de s.
// Trouve a l'occasion du trade EURUSD du 2026-09-21 (stop de 3,4 pips, spread 1,1 pip).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { buildTrades, makeSimulator, ftmoAttempts } from './lib/stopFloorCore.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const CUT = Date.UTC(2025, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const eng = (y, m = 0, d = 1) => Date.UTC(y, m, d) - FIXED_EST_TO_UTC_OFFSET_MS;

function loadGz(sym) {
  const lines = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) { const p = lines[i].split(','); if (p.length < 5) continue; out.push({ time: +p[0] - FIXED_EST_TO_UTC_OFFSET_MS, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 }); }
  return out;
}
function toM15(m1) {
  const out = []; let cur = null;
  for (const c of m1) {
    const b = Math.floor(c.time / 900000) * 900000;
    if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }; }
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
  }
  if (cur) out.push(cur);
  return out;
}
const m1Real = Object.fromEntries(SYMBOLS.map((s) => [s, loadGz(s)]));
const startOf = Object.fromEntries(SYMBOLS.map((s) => [s, m1Real[s][0].time + 30 * 86400000])); // 30 jours de chauffe par paire
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Real[s])]));
const m1 = {};
for (const s of SYMBOLS) { const cs = m1Real[s]; m1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }
console.error('donnees chargees');

const built = buildTrades(SYMBOLS, (s) => m15[s], () => {});
const mk = (drop) => makeSimulator({ all: built.all.filter((t) => t.time >= startOf[t.symbol] && !drop.includes(t.symbol)), cache: built.cache });
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
function resolveM1(t, d) {
  const S = m1[t.symbol]; const stop = t.entry - t.dir * d, tp = t.entry + t.dir * d * t.rr;
  const c0 = built.cache[t.symbol][t.i0]; const start = lower(S.t, S.n, c0.time); const end = Math.min(S.n, lower(S.t, S.n, c0.time + 900000));
  let fill = -1;
  if (Math.abs(t.entry - c0.open) <= 1e-9 * Math.max(1, Math.abs(c0.open))) fill = start < S.n ? start : -1; else for (let i = start; i < end; i++) if (S.l[i] <= t.entry && t.entry <= S.h[i]) { fill = i; break; }
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) { if (t.dir === 1 ? S.l[i] <= stop : S.h[i] >= stop) return { r: -1, exit: S.t[i] }; if (t.dir === 1 ? S.h[i] >= tp : S.l[i] <= tp) return { r: t.rr, exit: S.t[i] }; }
  return { r: (t.dir * (S.c[maxI - 1] - t.entry)) / d, exit: S.t[maxI - 1] };
}
function summarize(list, risk = 0.005) {
  const s = [...list].sort((a, b) => a.exit - b.exit);
  let bal = 10000, peak = 10000, dd = 0;
  for (const t of s) { bal *= 1 + risk * t.net; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
  const sum = list.reduce((a, t) => a + t.net, 0);
  return { n: list.length, sum, per: list.length ? sum / list.length : 0, win: list.length ? list.filter((t) => t.net > 0).length / list.length * 100 : 0, bal, dd, f: ftmoAttempts(list) };
}
const row = (l, r) => `| ${l} | ${r.n} | ${r.win.toFixed(0)} % | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} | $${r.bal.toFixed(0)} | ${r.dd.toFixed(0)} % | ${r.f.pass} / ${r.f.fail} |`;
const HEAD = ['| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |', '|---|---|---|---|---|---|---|---|'];
const run = (sim, o = {}) => sim(() => 0, null, { resolver: resolveM1, ...o });

const FLAT = { EURUSD: 0.00011, US100: 0.6, US500: 0.25, XAUUSD: 0.24 };
const S4 = SYMBOLS.filter((x) => x !== 'GER40');
const sim = makeSimulator({ all: built.all.filter((t) => t.time >= startOf[t.symbol] && t.symbol !== 'GER40' && t.dist >= 3 * FLAT[t.symbol]), cache: built.cache });
function makeResolver(live) {
  return (t, d) => {
    const s = FLAT[t.symbol], S = m1[t.symbol];
    const stopDist = live ? d - s : d, tpDist = live ? t.rr * d + s : t.rr * d;
    const stop = t.entry - t.dir * stopDist, tp = t.entry + t.dir * tpDist;
    const c0 = built.cache[t.symbol][t.i0]; const start = lower(S.t, S.n, c0.time); const end = Math.min(S.n, lower(S.t, S.n, c0.time + 900000));
    let fill = -1;
    if (Math.abs(t.entry - c0.open) <= 1e-9 * Math.max(1, Math.abs(c0.open))) fill = start < S.n ? start : -1; else for (let i = start; i < end; i++) if (S.l[i] <= t.entry && t.entry <= S.h[i]) { fill = i; break; }
    if (fill < 0) return null;
    const off = (DEFAULT_SPREADS[t.symbol] ?? 0) / d; // the simulator subtracts DEFAULT_SPREADS/d itself: add it back, our own cost is in r
    const win = live ? t.rr : t.rr - s / d, loss = live ? -1 : -1 - s / d;
    const maxI = Math.min(S.n, fill + 480 * 15);
    for (let i = fill; i < maxI; i++) { if (t.dir === 1 ? S.l[i] <= stop : S.h[i] >= stop) return { r: loss + off, exit: S.t[i] }; if (t.dir === 1 ? S.h[i] >= tp : S.l[i] <= tp) return { r: win + off, exit: S.t[i] }; }
    const mark = (t.dir * (S.c[maxI - 1] - t.entry)) / d - (live ? 0 : s / d);
    return { r: mark + off, exit: S.t[maxI - 1] };
  };
}
const A = sim(() => 0, null, { resolver: makeResolver(false) }), B = sim(() => 0, null, { resolver: makeResolver(true) });
const C = A.map((t) => ({ ...t, net: t.net * t.dist / (t.dist + FLAT[t.symbol]) })); // C = niveaux absolus + lots calcules sur d + s : le risque reel redevient 1 R
const md = ['# Géométrie des ordres : backtest contre live (stop relatif au prix de remplissage)', '', 'Combo actuel sans GER40, M1 réel sans trous, spreads mesurés. **A** = stop/cible aux niveaux de la stratégie, spread payé à l\'entrée (ce que le backtest simule). **C** = correctif proposé : après le remplissage, amender la position avec le stop et la cible ABSOLUS de la stratégie, et calculer les lots sur d + s pour que la perte maximale reste 1 R du risque prévu (résultat de A recalculé par d/(d+s)). **B** = ce que fait le bot en MARKET : stop et cible relatifs au prix de remplissage (l\'API cTrader n\'accepte pas de stop absolu sur un ordre au marché) : le stop est plus serré du spread (distance en prix bid = d - s), la cible plus loin (3d + s), la perte est exactement -1 R. Trouvé après le trade EURUSD du 2026-09-21 (stop 3,4 pips, spread 1,1 pip).', '', ...HEAD];
for (const [k, f] of [['Tout', () => true], ['Entraînement (avant 2025)', (t) => t.time < CUT], ['Test (2025 →)', (t) => t.time >= CUT]]) { md.push(row(`A — backtest — ${k}`, summarize(A.filter(f)))); md.push(row(`B — live — ${k}`, summarize(B.filter(f)))); md.push(row(`C — niveaux absolus, lots sur d+s — ${k}`, summarize(C.filter(f)))); }
md.push('', '## Par paire (tout l\'historique)', '', '| Paire | Trades A | R net A | Trades B | R net B | Écart B - A |', '|---|---|---|---|---|---|');
for (const s of S4) { const a = A.filter((t) => t.symbol === s), b = B.filter((t) => t.symbol === s); const ra = a.reduce((x, t) => x + t.net, 0), rb = b.reduce((x, t) => x + t.net, 0); md.push(`| ${s} | ${a.length} | ${fmt(ra, 1)} | ${b.length} | ${fmt(rb, 1)} | ${fmt(rb - ra, 1)} |`); }
const rel = A.map((t) => FLAT[t.symbol] / t.dist), q = [...rel].sort((x, y) => x - y);
md.push('', `Part du spread dans la distance du stop (s/d) : médiane ${(q[Math.floor(q.length / 2)] * 100).toFixed(0)} %, 90e centile ${(q[Math.floor(q.length * 0.9)] * 100).toFixed(0)} %, maximum ${(q[q.length - 1] * 100).toFixed(0)} % (le filtre impose ≤ 33 %).`, '', '## Limites', '', '- Garde-fous approximés ; spreads mesurés sur 9 h seulement ; glissement = spread. Le chiffre absolu est surestimé, lire l\'écart entre A et B.', '- B suppose que le broker exécute le stop relatif exactement à distance d du prix de remplissage (constaté : stop rempli 1,1472 pour un remplissage 1,14755, soit 3,5 pips).');
fs.writeFileSync('data/backtest-input/order-geometry-live-vs-backtest.md', md.join('\n'));
console.log(md.join('\n'));
