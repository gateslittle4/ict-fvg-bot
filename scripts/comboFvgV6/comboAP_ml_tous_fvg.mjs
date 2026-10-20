// comboAP_ml_tous_fvg.mjs - modèle appris sur tous les FVG M15 : extraction des candidats (avec étiquette R indépendante) et exécution du moteur filtré.
// Règles et critères FIGÉS : docs/PREREG-ML-TOUS-FVG.md (écrit avant tout calcul). Le script refuse de tourner si ce fichier a été modifié.
// Usage :
//   node --max-old-space-size=6144 comboAP_ml_tous_fvg.mjs extract <dossier data> <dossier de sortie>
//   node --max-old-space-size=6144 comboAP_ml_tous_fvg.mjs execute <dossier data> <fichier de sélection> <fichier de sortie>
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RULES, summarize } from './comboF.mjs';
import { backtest as backtestC } from './lib/krysBacktestC.js';
import { backtest as backtestML } from './lib/krysBacktestML.js';
import { h4Sweeps, h4SweepFilter } from './lib/krysBacktest.js';
import { nyHour } from './lib/krysMethod.js';
import { loadInstrument, runYearF2, sha256Text } from './comboAN_autres_instruments.mjs';

export const PREREG_FILE = fileURLToPath(new URL('../../docs/PREREG-ML-TOUS-FVG.md', import.meta.url));
export const PREREG_SHA256 = 'd3ed96e73763fd5a311ece670c5d903bf0b4f689782cf4be9278b17575e8ba44';
export const MIN_HIST = 2014; // 14 bougies d'ATR + 2 000 valeurs d'ATR pour la médiane : une bougie de pose d'indice < 2014 est écartée
export const FEATS = ['dir', 'lnRisqueATR', 'lnRRprevu', 'age', 'hauteurFVGsurRisque', 'distObjectifATR', 'hauteurCibleATR', 'h09_12', 'h12_16', 'lundi', 'vendredi', 'balayage32', 'depuisBalayage', 'pos96', 'pos480', 'ret96ATR', 'ret480ATR', 'atrRel'];

const t0 = (y) => Date.UTC(y, 0, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Contexte d'une année civile : bougies jusqu'à la fin de l'année, début, échelle de coûts (même convention que runYearF2). */
export function yearCtx(all, Y) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  return { Y, c, start, k };
}
export const baseOpts = (cx) => ({ start: cx.start, spread: RULES.spread * cx.k, stopMargin: RULES.stopMargin * cx.k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction });

/** ATR(14) par bougie (moyenne du vrai range sur 14 bougies finissant à i incluse) ; NaN avant l'indice 14. */
export function atrSeries(c) {
  const n = c.length, tr = new Float64Array(n), out = new Float64Array(n).fill(NaN); let s = 0;
  for (let i = 1; i < n; i++) { tr[i] = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)); s += tr[i]; if (i > 14) s -= tr[i - 14]; if (i >= 14) out[i] = s / 14; }
  return out;
}
const median = (arr) => { const a = Float64Array.from(arr).sort(); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };

/** Les 18 variables, toutes calculées avec des bougies d'indice <= m (bougie de pose). a = argument du filtre du moteur. */
export function features(cx, a) {
  const { c, atr, sw } = cx, m = a.m, z = a.z, A = atr[m], k = c[m];
  const hr = nyHour(k.t), dow = new Date((k.t - 5 * 3600) * 1000).getUTCDay();
  const li = z.dir > 0 ? sw.lastLow[z.created] : sw.lastHigh[z.created];
  let hi96 = -Infinity, lo96 = Infinity, hi480 = -Infinity, lo480 = Infinity;
  for (let q = m - 479; q <= m; q++) { if (c[q].h > hi480) hi480 = c[q].h; if (c[q].l < lo480) lo480 = c[q].l; if (q >= m - 95) { if (c[q].h > hi96) hi96 = c[q].h; if (c[q].l < lo96) lo96 = c[q].l; } }
  const med = median(cx.atr.subarray(m - 1999, m + 1));
  return {
    dir: z.dir, lnRisqueATR: Math.log(a.risk / A), lnRRprevu: Math.log(a.rr), age: m - z.created, hauteurFVGsurRisque: (z.g.hi - z.g.lo) / a.risk,
    distObjectifATR: Math.abs(a.tp - a.entry) / A, hauteurCibleATR: (a.tg.hi - a.tg.lo) / A, h09_12: hr >= 9 && hr < 12 ? 1 : 0, h12_16: hr >= 12 && hr < 16 ? 1 : 0,
    lundi: dow === 1 ? 1 : 0, vendredi: dow === 5 ? 1 : 0, balayage32: li >= 0 && z.created - li <= 32 ? 1 : 0, depuisBalayage: li >= 0 ? Math.min(96, m - li) : 96,
    pos96: (a.entry - lo96) / (hi96 - lo96), pos480: (a.entry - lo480) / (hi480 - lo480), ret96ATR: (k.c - c[m - 96].c) / A, ret480ATR: (k.c - c[m - 480].c) / A, atrRel: A / med,
  };
}

/** R que ce candidat donnerait pris seul (mêmes conventions que le moteur : stop d'abord, remplissage prioritaire sur l'annulation, sortie au temps à 96 bougies). */
export function labelSim(all, cd, spread, hourFrom = RULES.hourFrom, hourTo = RULES.hourTo) {
  const buy = cd.dir > 0; let fillIdx = -1;
  for (let m = cd.m + 1; m < all.length; m++) {
    const k = all[m];
    if (fillIdx >= 0) {
      const stopHit = buy ? k.l <= cd.stop : k.h + spread >= cd.stop, tpHit = m > fillIdx && (buy ? k.h >= cd.tp : k.l + spread <= cd.tp);
      let exit = null;
      if (stopHit) exit = cd.stop; else if (tpHit) exit = cd.tp; else if (m - fillIdx >= 96) exit = buy ? k.c : k.c + spread;
      if (exit !== null) return { filled: 1, r: (buy ? exit - cd.entry : cd.entry - exit) / cd.risk };
      continue;
    }
    const hr = nyHour(k.t), fillHit = buy ? k.l + spread <= cd.entry : k.h >= cd.entry;
    const killed = (cd.z.dead != null && cd.z.dead < m) || (buy ? k.l <= cd.stop : k.h >= cd.stop) || (buy ? k.h >= cd.tp : k.l <= cd.tp) || hr >= hourTo || hr < hourFrom;
    if (fillHit) { fillIdx = m; if (buy ? k.l <= cd.stop : k.h + spread >= cd.stop) return { filled: 1, r: -1 }; continue; }
    if (killed) return { filled: 0, r: null };
  }
  return { filled: 0, r: null };
}

const keyOf = (inst, Y, m, zc, dir) => `${inst}|${Y}|${m}|${zc}|${dir}`;

/** Tous les candidats d'une année (moteur noFill), avec variables et étiquette. */
export function candidatesYear(inst, all, Y) {
  const cx = yearCtx(all, Y); if (!cx) return null;
  cx.atr = atrSeries(cx.c); cx.sw = h4Sweeps(cx.c, 6);
  const raw = []; let excl = 0;
  backtestML(cx.c, { ...baseOpts(cx), noFill: true, buyOnly: false, filter: (a) => { if (a.m < MIN_HIST) { excl++; return true; } raw.push({ a, f: features(cx, a) }); return true; } });
  const spread = RULES.spread * cx.k, rows = [];
  for (const { a, f } of raw) {
    const cd = { m: a.m, z: a.z, dir: a.z.dir, entry: a.entry, stop: a.stop, tp: a.tp, risk: a.risk }, L = labelSim(all, cd, spread);
    rows.push({ inst, Y, m: a.m, zc: a.z.created, dir: a.z.dir, filled: L.filled, r: L.r === null ? '' : L.r, ...f });
  }
  return { rows, excl, cx };
}

const COLS = ['inst', 'Y', 'm', 'zc', 'dir', 'filled', 'r', ...FEATS.filter((f) => f !== 'dir')];
const toCsv = (rows) => COLS.join(',') + '\n' + rows.map((x) => COLS.map((k) => x[k]).join(',')).join('\n') + '\n';

function checkPrereg() {
  if (!fs.existsSync(PREREG_FILE)) { console.error('Pré-enregistrement introuvable :', PREREG_FILE, '-> aucun calcul sans lui.'); process.exit(1); }
  const h = sha256Text(fs.readFileSync(PREREG_FILE, 'utf8'));
  if (h !== PREREG_SHA256) { console.error(`Le pré-enregistrement a été modifié (SHA-256 ${h}, attendu ${PREREG_SHA256}). Aucun calcul.`); process.exit(1); }
  return h;
}

function cmdExtract(D, OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  // ---- contrôles (US100, 2011-2022) ----
  const us = loadInstrument(D, 'US100'), dev = [];
  let exclTot = 0;
  for (const Y of range(2011, 2025)) { const r = candidatesYear('US100', us, Y); if (r) { dev.push(...r.rows); exclTot += r.excl; } }
  // contrôle 1 : F2 redonne 1 222 trades, 129,7 R, pire baisse 27,4
  const f2 = []; for (const Y of range(2011, 2022)) { const r = runYearF2(us, Y, {}); if (r) f2.push(...r); }
  const cs = summarize(f2.map((t) => t.r)), c1 = cs.n === 1222 && Math.abs(cs.totalR - 129.7) < 0.06 && Math.abs(cs.dd - 27.4) < 0.06;
  // contrôle 2 : le R de l'étiquette indépendante = le R du moteur, sur les trades réellement exécutés par F2 (achats avec balayage), 2011-2022
  const byKey = new Map(dev.map((x) => [keyOf(x.inst, x.Y, x.m, x.zc, x.dir), x])); let nT = 0, nOk = 0, nMiss = 0;
  for (const Y of range(2011, 2022)) {
    const cx = yearCtx(us, Y); if (!cx) continue; const sw = h4SweepFilter(cx.c, { N: RULES.N, W: RULES.W });
    const T = backtestC(cx.c, { ...baseOpts(cx), buyOnly: true, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= cx.start && cx.c[t.fillIdx].raw < t0(Y + 1));
    for (const t of T) { nT++; const x = byKey.get(keyOf('US100', Y, t.placedIdx, t.zCreated, t.dir)); if (!x) { if (t.placedIdx >= MIN_HIST) nMiss++; else nT--; continue; } if (x.filled === 1 && Math.abs(x.r - t.r) < 1e-9) nOk++; }
  }
  const rate = nT ? nOk / nT : 0, c2 = rate >= 0.99; // comme écrit dans le pré-enregistrement : au moins 99 % identiques (les candidats absents comptent comme non identiques)
  const controls = { f2: { n: cs.n, totalR: +cs.totalR.toFixed(2), dd: +cs.dd.toFixed(2), ok: c1 }, labelMatch: { nTrades: nT, nMatch: nOk, nMissingCandidate: nMiss, rate: +rate.toFixed(4), ok: c2 }, exclHist: exclTot };
  fs.writeFileSync(`${OUT}/controles.json`, JSON.stringify(controls, null, 1));
  console.log('CONTRÔLES :', JSON.stringify(controls));
  if (!c1 || !c2) { console.log('Un contrôle échoue : rien d\'autre n\'est écrit.'); process.exit(1); }
  fs.writeFileSync(`${OUT}/setups_dev.csv`, toCsv(dev));
  console.log('setups US100 2011-2025 :', dev.length, '(étiquetés :', dev.filter((x) => x.filled === 1).length + ')');
  // ---- scellé : extrait mais NI affiché NI lu ----
  const sealed = []; let nS = 0;
  const r26 = candidatesYear('US100', us, 2026); if (r26) sealed.push(...r26.rows);
  for (const inst of ['GER40', 'XAUUSD']) { const a = loadInstrument(D, inst); for (const Y of range(2023, 2026)) { const r = candidatesYear(inst, a, Y); if (r) sealed.push(...r.rows); } }
  nS = sealed.length; fs.writeFileSync(`${OUT}/setups_scelle.csv`, toCsv(sealed));
  console.log('setups sous scellé écrits :', nS, '(contenu non affiché)');
}

function cmdExecute(D, SEL, OUTF) {
  const lines = fs.readFileSync(SEL, 'utf8').trim().split('\n'), head = lines[0].split(','), ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const sel = new Map(), groups = new Map();
  for (const l of lines.slice(1)) { const p = l.split(','); sel.set(keyOf(p[ix.inst], p[ix.Y], p[ix.m], p[ix.zc], p[ix.dir]), +p[ix.sel]); const g = `${p[ix.inst]}|${p[ix.Y]}`; groups.set(g, (groups.get(g) || 0) + 1); }
  const insts = [...new Set([...groups.keys()].map((g) => g.split('|')[0]))], out = ['kind,inst,Y,r,why,fillRaw']; let unscored = 0, decisions = 0, nMl = 0, nF2 = 0; const dec = new WeakMap(); // une seule décision par zone (la première fois que le moteur la propose)
  for (const inst of insts) {
    const all = loadInstrument(D, inst);
    for (const g of [...groups.keys()].filter((x) => x.startsWith(inst + '|'))) {
      const Y = +g.split('|')[1], cx = yearCtx(all, Y); if (!cx) continue;
      const T = backtestC(cx.c, { ...baseOpts(cx), buyOnly: false, filter: (a) => { let d = dec.get(a.z); if (d !== undefined) return d; decisions++; const v = sel.get(keyOf(inst, Y, a.m, a.z.created, a.z.dir)); if (v === undefined) { unscored++; d = false; } else d = v === 1; dec.set(a.z, d); return d; } }).trades.filter((t) => t.fillIdx >= cx.start && cx.c[t.fillIdx].raw < t0(Y + 1));
      for (const t of T) { out.push(`ml,${inst},${Y},${t.r},${t.why},${cx.c[t.fillIdx].raw}`); nMl++; }
      const f = runYearF2(all, Y, {}) || []; for (const t of f) { out.push(`f2,${inst},${Y},${t.r},${t.why},0`); nF2++; }
    }
  }
  fs.writeFileSync(OUTF, out.join('\n') + '\n'); fs.writeFileSync(OUTF + '.meta.json', JSON.stringify({ decisions, unscored, nMl, nF2 }));
  console.log(`exécution terminée : ${nMl} trades du moteur filtré, ${nF2} trades F2 de comparaison, décisions : ${decisions}, candidats sans score : ${unscored} (${decisions ? (100 * unscored / decisions).toFixed(2) : 0} %) ->`, OUTF);
}

if (process.argv[1] && process.argv[1].endsWith('comboAP_ml_tous_fvg.mjs')) {
  const [cmd, a, b, c] = process.argv.slice(2);
  if (!['extract', 'execute'].includes(cmd) || !a || !b) { console.error('Usage : extract <data> <sortie> | execute <data> <sélection.csv> <sortie.csv>'); process.exit(2); }
  const h = checkPrereg(); console.log('ML tous FVG | pré-enregistrement SHA-256', h, '| lancé', new Date().toISOString());
  if (cmd === 'extract') cmdExtract(a, b); else cmdExecute(a, b, c);
}
