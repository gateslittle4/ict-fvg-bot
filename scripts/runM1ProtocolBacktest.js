#!/usr/bin/env node
// runM1ProtocolBacktest.js
// Usage: node --max-old-space-size=4096 scripts/runM1ProtocolBacktest.js
//
// Applique le protocole PRE-ENREGISTRE `protocol-m1-full-history-validation` (data/research-memory.json) a tout l'historique M1 reel du broker
// (data/real-m1-full/*.csv.gz, issu de data/real-m1-history-v2 : fenetres de 8 jours, sans les trous du v1).
// 1) Combo ACTUEL, fige : mesure sur tout l'historique, par annee, par mois, par paire (aucun reglage, donc pas de decoupage necessaire) ;
//    lu aussi en entrainement (< 2025-01-01) et test (>= 2025-01-01) pour comparaison.
// 2) Hypotheses de modification, 3 au total, COMPTEES : H1 retirer GER40, H2 retirer EURUSD, H3 retirer les deux. Elles viennent d'un premier regard
//    (rapport de 16 mois, invalide mais indicatif) : ce biais est declare. Regle ecrite avant le calcul :
//    - retenue pour lecture du test SEULEMENT si, sur l'entrainement, la paire retiree a un R net total <= 0 (retirer ne fait pas baisser le total) ;
//    - le test est lu UNE fois ; rejet si R/trade du test < celui du combo, OU pire baisse plus grande, OU amelioration de R/trade non retrouvee
//      sur au moins la moitie des tranches annuelles (2023, 2024, 2025, 2026).
//    Meme reussie, une hypothese n'est jamais « adoptee » : au mieux « candidate, a confirmer en demo ».
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { buildTrades, makeSimulator, ftmoAttempts } from './lib/stopFloorCore.js';

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
function summarize(list) {
  const s = [...list].sort((a, b) => a.exit - b.exit);
  let bal = 10000, peak = 10000, dd = 0;
  for (const t of s) { bal *= 1 + 0.005 * t.net; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
  const sum = list.reduce((a, t) => a + t.net, 0);
  return { n: list.length, sum, per: list.length ? sum / list.length : 0, win: list.length ? list.filter((t) => t.net > 0).length / list.length * 100 : 0, bal, dd, f: ftmoAttempts(list) };
}
const row = (l, r) => `| ${l} | ${r.n} | ${r.win.toFixed(0)} % | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} | $${r.bal.toFixed(0)} | ${r.dd.toFixed(0)} % | ${r.f.pass} / ${r.f.fail} |`;
const HEAD = ['| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |', '|---|---|---|---|---|---|---|---|'];
const run = (sim, o = {}) => sim(() => 0, null, { resolver: resolveM1, ...o });

const simAll = mk([]);
const all = run(simAll);
const first = Math.min(...all.map((t) => t.time)), last = Math.max(...all.map((t) => t.exit));
const day = (t) => new Date(t + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10);
const md = ['# Combo actuel (inchangé) sur tout l\'historique M1 réel du broker — protocole pré-enregistré', '',
  `Données : bougies M1 réelles FP Markets (EURUSD/XAUUSD dès 2022-05-19, indices dès 2023-01-11, jusqu'à ${day(last)}), fenêtres d'export de 8 jours (sans les trous du premier export), M15 reconstruits du M1, 30 jours de chauffe par paire ignorés (trades du ${day(first)} au ${day(last)}). Règlement à la minute (M1 exact). Protocole : \`protocol-m1-full-history-validation\` dans \`data/research-memory.json\`.`, '',
  '**Lecture :** garde-fous approximés (3 trades/jour, 1 position par paire, pause 30 min après perte, arrêt du jour à -4R, stop ≥ 3× le spread), coûts (commission, swap, glissement) non modélisés : le niveau absolu est surestimé (sur 7 mois, ~+53 % ici contre ~+31 % pour le vrai moteur). Lire les différences entre périodes, pas les dollars.', ''];

md.push('## 1. Combo actuel, figé', '', ...HEAD);
md.push(row('**Tout l\'historique**', summarize(all)));
md.push(row('Entraînement (avant 2025)', summarize(all.filter((t) => t.time < CUT))));
md.push(row('Test (2025-01-01 → fin)', summarize(all.filter((t) => t.time >= CUT))));
md.push('', '### Année par année', '', '| Année | Trades | R net | R / trade | Baisse max |', '|---|---|---|---|---|');
const years = [2022, 2023, 2024, 2025, 2026]; let posY = 0, nY = 0;
for (const y of years) { const l = all.filter((t) => t.time >= eng(y) && t.time < eng(y + 1)); if (!l.length) continue; const r = summarize(l); nY++; if (r.sum > 0) posY++; md.push(`| ${y}${y === 2022 ? ' (à partir de juin, 2 paires)' : y === 2026 ? ' (jusqu\'à septembre)' : ''} | ${r.n} | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} | ${r.dd.toFixed(0)} % |`); }
md.push('', `Années positives : ${posY} sur ${nY}.`, '', '### Mois par mois', '', '| Mois | Trades | R net | R / trade |', '|---|---|---|---|');
const months = new Map(); for (const t of all) { const k = new Date(t.time + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 7); (months.get(k) ?? months.set(k, []).get(k)).push(t); }
let posM = 0; const monthR = [];
for (const [k, l] of [...months.entries()].sort()) { const r = summarize(l); if (r.sum > 0) posM++; monthR.push([k, r.sum]); md.push(`| ${k} | ${r.n} | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} |`); }
md.push('', `Mois positifs : ${posM} sur ${months.size}.`);
const total = all.reduce((a, t) => a + t.net, 0); const best = [...monthR].sort((a, b) => b[1] - a[1])[0];
md.push(`Meilleur mois : ${best[0]} (${fmt(best[1], 1)} R, soit ${(best[1] / total * 100).toFixed(0)} % du total) ; total sans ce mois : ${fmt(total - best[1], 1)} R.`, '', '### Par paire et par année (R net / trades)', '', `| Paire | ${years.join(' | ')} | Tout |`, `|---|${years.map(() => '---|').join('')}---|`);
for (const s of SYMBOLS) md.push(`| ${s} | ${years.map((y) => { const l = all.filter((t) => t.symbol === s && t.time >= eng(y) && t.time < eng(y + 1)); return l.length ? `${fmt(l.reduce((a, t) => a + t.net, 0), 1)} / ${l.length}` : '—'; }).join(' | ')} | ${(() => { const l = all.filter((t) => t.symbol === s); return `${fmt(l.reduce((a, t) => a + t.net, 0), 1)} / ${l.length} (${fmt(l.reduce((a, t) => a + t.net, 0) / l.length, 3)} R/trade)`; })()} |`);

// ---- 2) hypotheses de modification (3, comptees)
md.push('', '## 2. Hypothèses de modification (3 testées, aucune autre)', '', 'Règle écrite avant le calcul : lecture du test seulement si, à l\'entraînement, la paire retirée a un R net total ≤ 0. Rejet si R/trade du test < combo, OU pire baisse plus grande, OU amélioration de R/trade présente dans moins de la moitié des tranches annuelles (2023 à 2026). Voir aussi la note sur le biais de sélection ci-dessus.', '');
const H = [['H1 retirer GER40', ['GER40']], ['H2 retirer EURUSD', ['EURUSD']], ['H3 retirer GER40 et EURUSD', ['GER40', 'EURUSD']]];
const base = { train: summarize(all.filter((t) => t.time < CUT)), test: summarize(all.filter((t) => t.time >= CUT)) };
const slices = [2023, 2024, 2025, 2026];
for (const [name, drop] of H) {
  const sim = mk(drop); const list = run(sim);
  const tr = list.filter((t) => t.time < CUT), te = list.filter((t) => t.time >= CUT);
  const droppedTrainR = all.filter((t) => t.time < CUT && drop.includes(t.symbol)).reduce((a, t) => a + t.net, 0);
  md.push(`### ${name}`, '', `- Entraînement : R net des paires retirées = ${fmt(droppedTrainR, 1)} → ${droppedTrainR <= 0 ? 'retenue pour lecture du test' : 'NON retenue (retirer fait baisser le total à l\'entraînement) : test non lu'}.`);
  if (droppedTrainR > 0) { md.push(''); continue; }
  const rt = summarize(te);
  let better = 0; const rows = [];
  for (const y of slices) { const a = summarize(all.filter((t) => t.time >= eng(y) && t.time < eng(y + 1))), b = summarize(list.filter((t) => t.time >= eng(y) && t.time < eng(y + 1))); const ok = b.per > a.per; if (ok) better++; rows.push(`| ${y} | ${fmt(a.per, 3)} | ${fmt(b.per, 3)} | ${ok ? 'oui' : 'non'} |`); }
  const c1 = rt.per >= base.test.per, c2 = rt.dd <= base.test.dd, c3 = better >= slices.length / 2;
  md.push('', ...HEAD, row('Test — combo actuel', base.test), row(`Test — ${name}`, rt), '', '| Année | R/trade combo | R/trade modifié | Amélioré |', '|---|---|---|---|', ...rows, '',
    `- Critères : R/trade du test ≥ combo : ${c1 ? 'oui' : 'NON'} ; pire baisse ≤ combo : ${c2 ? 'oui' : 'NON'} ; amélioré dans ≥ moitié des tranches (${better}/${slices.length}) : ${c3 ? 'oui' : 'NON'}.`,
    `- Verdict : **${c1 && c2 && c3 ? 'candidate, à confirmer en démo (jamais adoptée sur ce seul test)' : 'REJETÉE'}**. R net total du test : combo ${fmt(base.test.sum, 1)} R contre ${fmt(rt.sum, 1)} R modifié (un R/trade plus haut avec moins de trades peut donner MOINS de R au total).`, '');
}
md.push('## Limites', '', '- Combo réglé sur 2010-2025 (plusieurs découpages, nombreuses comparaisons) : le M1 des mêmes années est une remesure exacte, pas une preuve indépendante. Seule la démo (depuis 2026-09-21) est vierge.', '- Garde-fous simulés de façon approximative ; commissions, swap, glissement, spread variable non modélisés.', '- Un mois extrême peut dominer (voir « Meilleur mois »).', '- Les indices n\'ont de M1 que depuis 2023-01 : la composition du portefeuille change entre 2022 et 2023.', '- Le chiffre de référence du vrai moteur (~+31 % sur les 7 derniers mois) reste celui à citer pour le niveau.');
fs.writeFileSync('data/backtest-input/combo-m1-full-history.md', md.join('\n'));
console.log(md.join('\n'));
