// comboAR_swing.mjs - la règle F2 transposée au swing court terme (SW1 : FVG H1, balayage du plus bas des 4 derniers jours).
// Règle, coûts et critères FIGÉS : voir docs/PREREG-SWING-H1.md (écrit et commité avant tout calcul). Le script refuse de tourner si ce fichier a été modifié.
// Usage : node --max-old-space-size=6144 comboAR_swing.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué)
//         node --max-old-space-size=6144 comboAR_swing.mjs <dossier data> test    -> lecture unique 2023-2026, seulement si l'entraînement passe
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readM1, RULES, summarize, fmt } from './comboF.mjs';
import { toM15 } from './comboAN_autres_instruments.mjs';
import { backtest } from './lib/krysBacktestS.js';
import { h4SweepFilter } from './lib/krysBacktest.js';

export const PREREG_FILE = fileURLToPath(new URL('../../docs/PREREG-SWING-H1.md', import.meta.url));
export const PREREG_SHA256 = '8461d27d872df720cbc1dadf25750f12aabcf71d42fa67b8c412ea7fa7da21ed';
export const sha256Text = (txt) => crypto.createHash('sha256').update(txt.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
/** Constantes figées par le pré-enregistrement. barSec : durée d'une bougie d'entrée ; N : jours complets du balayage. */
export const SW1 = { barSec: 3600, N: 4, W: 32, orderMaxBars: 40, maxHold: 96, swapYear: 0.07 };
export const SW4 = { barSec: 14400, N: 16, W: 32, orderMaxBars: 40, maxHold: 96, swapYear: 0.07 };

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Agrège des bougies M15 (temps moteur t, raw = UTC ms) en bougies de sec secondes alignées sur New York (clé floor((t − 5 h)/sec)). */
export function aggregate(c, sec) {
  const out = []; let cur = null;
  for (const k of c) {
    const key = Math.floor((k.t - 5 * 3600) / sec);
    if (!cur || cur.key !== key) { if (cur) out.push(cur); cur = { key, t: k.t, raw: k.raw, o: k.o, h: k.h, l: k.l, c: k.c }; }
    else { if (k.h > cur.h) cur.h = k.h; if (k.l < cur.l) cur.l = k.l; cur.c = k.c; }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Balayages daily : pour chaque bougie, indice de la dernière fois où une mèche est passée sous le plus bas des N derniers jours COMPLETS
 * (jours calendaires de New York). Même logique que h4Sweeps (lib/krysBacktest.js), avec une période de 86 400 s. -1 si jamais.
 */
export function dailySweeps(c, N) {
  const lastLow = new Int32Array(c.length).fill(-1), D = []; let cur = null, ll = -1;
  for (let m = 0; m < c.length; m++) {
    const k = c[m], key = Math.floor((k.t - 5 * 3600) / 86400);
    if (!cur || cur.key !== key) { if (cur) D.push(cur); cur = { key, l: k.l }; } else if (k.l < cur.l) cur.l = k.l;
    if (D.length >= N) { let lo = Infinity; for (let q = D.length - N; q < D.length; q++) if (D[q].l < lo) lo = D[q].l; if (k.l < lo) ll = m; }
    lastLow[m] = ll;
  }
  return lastLow;
}

/** Nuits passées en position : passages de 17 h New York entre la bougie de remplissage et la bougie de sortie (temps moteur). */
export const nights = (tFill, tExit) => Math.floor((tExit - 22 * 3600) / 86400) - Math.floor((tFill - 22 * 3600) / 86400);

/**
 * Règle swing sur un an civil, série continue. bars : bougies agrégées (H1 ou H4). P : SW1 ou SW4. opt : { raw (sans balayage), spreadMult, swapYear }.
 * Renvoie [{ Y, r (net du swap), gross (avant swap), why, nights, bars (durée en bougies), placedRaw }].
 */
export function runYearSwing(bars, Y, P, { raw = false, spreadMult = 1, swapYear = P.swapYear } = {}) {
  const i1 = lowerRaw(bars, t0(Y + 1)), c = bars.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 200) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = raw ? null : dailySweeps(c, P.N);
  const o = { start, spread: RULES.spread * k * spreadMult, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: 0, hourTo: 24, entryFraction: RULES.entryFraction, buyOnly: true, maxHold: P.maxHold, orderMaxBars: P.orderMaxBars };
  const filter = (a) => a.z.dir > 0 && (raw || (sw[a.z.created] >= 0 && a.z.created - sw[a.z.created] <= P.W));
  return backtest(c, { ...o, filter }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1)).map((t) => {
    const n = nights(c[t.fillIdx].t, c[t.exitIdx].t), cost = t.entry * swapYear / 365 * n / t.risk;
    return { Y, r: t.r - cost, gross: t.r, why: t.why, nights: n, bars: t.exitIdx - t.fillIdx, placedRaw: c[t.placedIdx].raw };
  });
}

/** Jugement de l'entraînement (pré-enregistré). T : trades 2011-2022. */
export function judgeTrain(T) {
  const s = summarize(T.map((t) => t.r)), a = summarize(T.filter((t) => t.Y <= 2016).map((t) => t.r)), b = summarize(T.filter((t) => t.Y >= 2017).map((t) => t.r));
  const c1 = s.n >= 150, c2 = s.avgR > 0 && s.t >= 1.96, c3 = a.avgR > 0 && b.avgR > 0, c4 = s.dd > 0 ? s.totalR / s.dd >= 2 : s.totalR > 0;
  return { c1, c2, c3, c4, verdict: !c1 ? 'NON_JUGEABLE' : (c2 && c3 && c4 ? 'PASSE' : 'REJETEE'), s, a, b };
}
/** Jugement du test (pré-enregistré). */
export const judgeTest = (T) => { const s = summarize(T.map((t) => t.r)); return s.avgR > 0 && s.t >= 1.0; };

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i), inY = (T, a, b) => T.filter((t) => t.Y >= a && t.Y <= b), rs = (T) => T.map((t) => t.r);
function runYears(bars, years, P, opt) { const x = []; for (const Y of years) { const r = runYearSwing(bars, Y, P, opt); if (r) x.push(...r); } return x; }
const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const perYear = (T, years) => years.map((Y) => { const s = summarize(rs(inY(T, Y, Y))); return `${Y}: ${s.avgR.toFixed(2)}(${s.n})`; }).join('  ');
const durations = (T, barH) => `durée médiane ${(med(T.map((t) => t.bars)) * barH).toFixed(0)} h | tenus ≥ 1 nuit ${(100 * T.filter((t) => t.nights >= 1).length / Math.max(1, T.length)).toFixed(0)} % | nuits moyennes ${(T.reduce((s, t) => s + t.nights, 0) / Math.max(1, T.length)).toFixed(1)} | sortis au temps ${(100 * T.filter((t) => t.why === 'temps').length / Math.max(1, T.length)).toFixed(0)} % | gagnants : durée médiane ${(med(T.filter((t) => t.gross > 0).map((t) => t.bars)) * barH).toFixed(0)} h`;

if (process.argv[1] && process.argv[1].endsWith('comboAR_swing.mjs')) {
  const D = process.argv[2], MODE = process.argv[3], lines = [];
  const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };
  const save = () => fs.writeFileSync(fileURLToPath(new URL(`../../docs/SORTIE-SWING-H1-${MODE}.txt`, import.meta.url)), lines.join('\n') + '\n', 'utf8');
  if (!D || !['train', 'test'].includes(MODE)) { console.error('Usage : node comboAR_swing.mjs <dossier data> train|test'); process.exit(2); }
  const h = sha256Text(fs.readFileSync(PREREG_FILE, 'utf8'));
  if (h !== PREREG_SHA256) { console.error(`Pré-enregistrement modifié (SHA-256 ${h}). Aucun calcul.`); process.exit(1); }
  log(`SWING SW1 (FVG H1, balayage daily) | mode ${MODE} | pré-enregistrement SHA-256 ${h} | lancé ${new Date().toISOString()}`);

  const load = (sym) => { const brk = readM1(`${D}/real-m1-full/${sym}.csv.gz`), hist = readM1(`${D}/histdata-m1/${sym}.csv.gz`), cut = brk[0][0]; return toM15(hist.filter((r) => r[0] < cut).concat(brk)); };
  const m15 = load('US100');

  // ---- contrôle 1 : F2C en M15 avec le moteur S sans l'option ----
  const ctl = [];
  for (const Y of range(2011, 2022)) {
    const i1 = lowerRaw(m15, t0(Y + 1)), c = m15.slice(0, i1), start = lowerRaw(c, t0(Y)), px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
    const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
    ctl.push(...backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1)).map((t) => t.r));
  }
  const cs = summarize(ctl), ok1 = cs.n === 1222 && Math.abs(cs.totalR - 129.7) < 0.06 && Math.abs(cs.dd - 27.4) < 0.06;
  log('\nCONTRÔLE 1, F2C M15 2011-2022 avec le moteur S (attendu n=1222, R 129,7, dd 27,4) :', fmt(cs), ok1 ? '=> OK' : '=> ÉCHEC');
  // ---- contrôle 2 : nombre de bougies H1 par an ----
  const h1 = aggregate(m15, SW1.barSec), perY = range(2011, 2025).map((Y) => lowerRaw(h1, t0(Y + 1)) - lowerRaw(h1, t0(Y))), ok2 = perY.every((n) => n >= 5000 && n <= 6500);
  log(`CONTRÔLE 2, bougies H1 par an 2011-2025 : min ${Math.min(...perY)}, max ${Math.max(...perY)}`, ok2 ? '=> OK' : '=> ÉCHEC');
  if (!ok1 || !ok2) { log('Un contrôle échoue : rien d\'autre n\'est lu.'); save(); process.exit(1); }

  // ---- entraînement ----
  const TR = range(2011, 2022), TE = range(2023, 2026), T = runYears(h1, TR, SW1), j = judgeTrain(T);
  log('\n## ENTRAÎNEMENT US100 2011-2022, SW1, R nets du spread et du swap (7 %/an)');
  log('  2011-2022 :', fmt(j.s), `| R total / pire baisse ${(j.s.dd > 0 ? j.s.totalR / j.s.dd : 0).toFixed(2)}`);
  log('  2011-2016 :', fmt(j.a), '\n  2017-2022 :', fmt(j.b));
  log('  par an    :', perYear(T, TR));
  log(`  Critères : 1 (≥ 150 trades) ${j.c1 ? 'OK' : 'NON'} | 2 (R > 0, t ≥ 1,96) ${j.c2 ? 'OK' : 'NON'} | 3 (deux moitiés > 0) ${j.c3 ? 'OK' : 'NON'} | 4 (R total / pire baisse ≥ 2) ${j.c4 ? 'OK' : 'NON'}`);
  log(`\nENTRAÎNEMENT : ${{ PASSE: 'PASSE', REJETEE: 'ÉCHEC -> SW1 rejetée', NON_JUGEABLE: 'NON JUGEABLE (moins de 150 trades)' }[j.verdict]}`);

  log('\n## DESCRIPTIF 2011-2022 (non jugé)');
  log('  SW1 :', durations(T, 1));
  log('  SW1 avant swap        :', fmt(summarize(T.map((t) => t.gross))));
  log('  SW1 swap 10 %/an      :', fmt(summarize(rs(runYears(h1, TR, SW1, { swapYear: 0.10 })))));
  log('  SW1 spread x2         :', fmt(summarize(rs(runYears(h1, TR, SW1, { spreadMult: 2 })))));
  const rawT = runYears(h1, TR, SW1, { raw: true });
  log('  achats H1 sans balayage :', fmt(summarize(rs(rawT))), '|', durations(rawT, 1));
  const h4 = aggregate(m15, SW4.barSec), T4 = runYears(h4, TR, SW4);
  log('  SW4 (FVG H4, 16 jours) :', fmt(summarize(rs(T4))), '|', durations(T4, 4));
  log('    par an :', perYear(T4, TR));
  log('  achats H4 sans balayage :', fmt(summarize(rs(runYears(h4, TR, SW4, { raw: true })))));
  const h1s = aggregate(load('US500'), SW1.barSec), T5 = runYears(h1s, TR, SW1);
  log('  US500 SW1              :', fmt(summarize(rs(T5))), '\n    par an :', perYear(T5, TR));

  if (MODE === 'train' || j.verdict !== 'PASSE') {
    const n = runYears(h1, TE, SW1).length; log(`\nTest 2023-2026 NON LU (nombre seulement) : ${n} trades SW1.`); save(); process.exit(0);
  }
  // ---- test : lecture unique ----
  const X = runYears(h1, TE, SW1), sx = summarize(rs(X));
  log('\n## TEST US100 2023-01-01 -> 21/09/2026 (lecture unique)');
  log('  SW1 :', fmt(sx), '\n  par an :', perYear(X, TE), '\n ', durations(X, 1));
  log(`VERDICT (pré-enregistré) : ${judgeTest(X) ? 'SW1 prometteuse (non prouvée)' : 'SW1 rejetée'}`);
  log('\n## DESCRIPTIF 2023-2026 (non jugé)');
  log('  SW1 avant swap          :', fmt(summarize(X.map((t) => t.gross))));
  log('  SW1 swap 10 %/an        :', fmt(summarize(rs(runYears(h1, TE, SW1, { swapYear: 0.10 })))));
  log('  SW1 spread x2           :', fmt(summarize(rs(runYears(h1, TE, SW1, { spreadMult: 2 })))));
  log('  achats H1 sans balayage :', fmt(summarize(rs(runYears(h1, TE, SW1, { raw: true })))));
  log('  SW4 (FVG H4)            :', fmt(summarize(rs(runYears(h4, TE, SW4)))));
  log('  US500 SW1               :', fmt(summarize(rs(runYears(h1s, TE, SW1)))));
  save();
}
