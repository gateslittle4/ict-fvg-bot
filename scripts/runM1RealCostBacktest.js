#!/usr/bin/env node
// runM1ProtocolBacktest.js
// Usage: node --max-old-space-size=4096 scripts/runM1ProtocolBacktest.js
//
// Refait le backtest du combo INCHANGE sur le M1 sans trous avec des COUTS REELS : spreads mesures sur le compte demo (bot_spread_samples,
// dimanche 22:30 -> lundi 07:45 UTC seulement) au lieu des spreads fixes supposes. EURUSD 0,00011, US100 0,6, US500 0,25, XAUUSD 0,24 (constants,
// mesures) ; GER40 par heure UTC d'entree (22-23 h : 8,1 ; 0 h : 3,65 ; 1-5 h : 2,2-2,4 ; 6 h : 0,57 ; 7 h : 0,5). Les heures 8-21 h UTC ne sont PAS
// observees : deux scenarios (optimiste : 0,5 partout ; prudent : 0,5 de 8 h a 16 h, 2,3 de 17 h a 21 h). Le filtre « stop >= 3x le spread » est applique
// avec le spread de l'heure. Comparaison combo / sans GER40. C'est une SENSIBILITE aux couts, pas un nouveau test d'hypothese : rien n'est adopte.
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
const GER_H = { 22: 8.1, 23: 8.1, 0: 3.65, 1: 2.42, 2: 2.22, 3: 2.33, 4: 2.21, 5: 2.30, 6: 0.57, 7: 0.50 };
const hourUtc = (t) => new Date(t.time + FIXED_EST_TO_UTC_OFFSET_MS).getUTCHours();
const scen = { optimiste: (h) => GER_H[h] ?? 0.5, prudent: (h) => GER_H[h] ?? (h >= 17 && h <= 21 ? 2.3 : 0.5) };
const spreadOf = (name) => (t) => t.symbol === 'GER40' ? scen[name](hourUtc(t)) : FLAT[t.symbol];
const mkF = (pred) => makeSimulator({ all: built.all.filter((t) => t.time >= startOf[t.symbol] && pred(t)), cache: built.cache });
function runScenario(name, drop) {
  const sp = spreadOf(name);
  const sim = mkF((t) => !drop.includes(t.symbol) && t.dist >= 3 * sp(t));
  return sim(() => 0, null, { resolver: resolveM1 }).map((t) => ({ ...t, net: t.net - (sp(t) - (DEFAULT_SPREADS[t.symbol] ?? 0)) / t.dist, sp: sp(t) }));
}
const flat = mkF(() => true)(() => 0, null, { resolver: resolveM1 });
const runs = { 'Spreads supposés (référence, comme le rapport précédent)': flat };
for (const name of ['optimiste', 'prudent']) { runs[`Spreads mesurés — GER40 ${name} — combo actuel`] = runScenario(name, []); runs[`Spreads mesurés — GER40 ${name} — SANS GER40`] = runScenario(name, ['GER40']); }
const md = ['# Backtest du combo avec les spreads RÉELS mesurés (sensibilité aux coûts)', '', 'Combo inchangé, M1 réel sans trous (2022-06 → 2026-09), règlement à la minute. Spreads mesurés sur le compte démo (`bot_spread_samples`, **seulement dimanche 22:30 → lundi 07:45 UTC**, sans séance de New York ni annonces). EURUSD 0,00011, US100 0,6, US500 0,25, XAUUSD 0,24 mesurés constants ; GER40 varie selon l\'heure UTC d\'entrée (voir script). Les heures 8-21 h UTC de GER40 ne sont pas observées : scénario optimiste (0,5) et prudent (0,5 de 8 h à 16 h, 2,3 de 17 h à 21 h). Filtre « stop ≥ 3× le spread » appliqué avec le spread de l\'heure. **Sensibilité aux coûts, pas un nouveau test d\'hypothèse : rien n\'est adopté.** Le risque réel du bot est 0,3 % par trade (colonne « compte 0,3 % »), les simulations précédentes utilisaient 0,5 %.', ''];
const H2 = ['| Variante | Trades | R net | R / trade | Compte 10 000 $ (0,5 %) | Compte (0,3 %, réel) | Pire baisse (0,5 %) | FTMO (réussis / échoués) |', '|---|---|---|---|---|---|---|---|'];
const r2 = (l, list) => { const a = summarize(list), b = summarize(list, 0.003); return `| ${l} | ${a.n} | ${fmt(a.sum, 1)} | ${fmt(a.per, 3)} | $${a.bal.toFixed(0)} | $${b.bal.toFixed(0)} | ${a.dd.toFixed(0)} % | ${a.f.pass} / ${a.f.fail} |`; };
for (const [title, filt] of [['Tout l\'historique', () => true], ['Entraînement (avant 2025)', (t) => t.time < CUT], ['Test (2025-01-01 → fin)', (t) => t.time >= CUT]]) {
  md.push(`## ${title}`, '', ...H2); for (const [k, list] of Object.entries(runs)) md.push(r2(k, list.filter(filt))); md.push('');
}
md.push('## GER40 par plage horaire d\'entrée (UTC), spreads mesurés, scénario prudent', '', '| Plage | Trades | R net | R / trade | Spread moyen |', '|---|---|---|---|---|');
const gl = runs['Spreads mesurés — GER40 prudent — combo actuel'].filter((t) => t.symbol === 'GER40');
for (const [n, a, b] of [['Nuit (22-05 h)', 22, 5], ['Ouverture Francfort (06-08 h)', 6, 8], ['Journée européenne/NY (09-16 h)', 9, 16], ['Soir (17-21 h)', 17, 21]]) {
  const l = gl.filter((t) => { const h = hourUtc(t); return a <= b ? h >= a && h <= b : h >= a || h <= b; }); const r = l.reduce((x, t) => x + t.net, 0);
  md.push(`| ${n} | ${l.length} | ${fmt(r, 1)} | ${fmt(r / Math.max(1, l.length), 3)} | ${(l.reduce((x, t) => x + t.sp, 0) / Math.max(1, l.length)).toFixed(2)} |`);
}
md.push('', '## Par paire, spreads mesurés (prudent), tout l\'historique', '', '| Paire | Trades | R net | R / trade |', '|---|---|---|---|');
const pl = runs['Spreads mesurés — GER40 prudent — combo actuel'];
for (const s of SYMBOLS) { const l = pl.filter((t) => t.symbol === s); md.push(`| ${s} | ${l.length} | ${fmt(l.reduce((a, t) => a + t.net, 0), 1)} | ${fmt(l.reduce((a, t) => a + t.net, 0) / Math.max(1, l.length), 3)} |`); }
md.push('', '## Limites', '', '- Spreads mesurés sur 9 heures seulement (Asie/Europe du matin) : la séance de New York, les annonces et le rollover de 17 h NY ne sont pas mesurés. À refaire quand la table `bot_spread_samples` couvre plusieurs jours.', '- Glissement supposé égal au spread (constaté sur un seul trade réel). Commission 0 constatée. Swap non modélisé.', '- Garde-fous approximés : le niveau absolu reste surestimé ; lire les différences entre variantes.', '- « Sans GER40 » a déjà été lu sur le test dans le rapport du protocole (H1) : ici, seule la sensibilité aux coûts est regardée, pas une nouvelle décision.');
fs.writeFileSync('data/backtest-input/combo-m1-real-costs.md', md.join('\n'));
console.log(md.join('\n'));
