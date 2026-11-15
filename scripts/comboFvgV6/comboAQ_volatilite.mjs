// comboAQ_volatilite.mjs - F2 et régime de volatilité (VOL1). Règle, seuils et critères FIGÉS : voir docs/PREREG-F2-VOLATILITE.md
// (écrit et commité avant tout calcul). Le script refuse de tourner si ce fichier a été modifié.
// Usage : node --max-old-space-size=6144 comboAQ_volatilite.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué)
//         node --max-old-space-size=6144 comboAQ_volatilite.mjs <dossier data> test    -> lecture unique 2023-2025 (+ 2026 et autres instruments, descriptif)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readM1, RULES, summarize, fmt } from './comboF.mjs';
import { toM15 } from './comboAN_autres_instruments.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';

export const PREREG_FILE = fileURLToPath(new URL('../../docs/PREREG-F2-VOLATILITE.md', import.meta.url));
export const PREREG_SHA256 = 'f7aac0172aed8799add6486eefb3884039623a0e6400f376722a975ee958b2c9';
export const sha256Text = (txt) => crypto.createHash('sha256').update(txt.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
export const VOL = { atrLen: 14, medLen: 120, minHistory: 134 }; // figé par le pré-enregistrement

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/**
 * Régime de volatilité VOL1, causal. Retourne Int8Array : 1 = élevé, 0 = calme, pour chaque bougie m.
 * Jours NY : clé floor((t − 5 h)/86 400). ATRrel(d) = moyenne sur 14 jours de TR(d)/close(d−1). À la bougie m, on compare ATRrel du dernier
 * jour complet (d−1) à la médiane des ATRrel des 120 jours complets précédents (d−121 à d−2). Moins de 134 jours complets : calme.
 */
export function volRegime(c, { atrLen = VOL.atrLen, medLen = VOL.medLen } = {}) {
  const reg = new Int8Array(c.length), D = []; let cur = null; const atr = []; // atr[d] = ATRrel du jour d (NaN si pas assez de jours)
  const closeDay = () => {
    D.push(cur); const d = D.length - 1;
    if (d >= atrLen) { let s = 0; for (let j = d - atrLen + 1; j <= d; j++) { const pc = D[j - 1].c, tr = Math.max(D[j].h - D[j].l, Math.abs(D[j].h - pc), Math.abs(D[j].l - pc)); s += tr / pc; } atr.push(s / atrLen); } else atr.push(NaN);
  };
  let state = 0;
  for (let m = 0; m < c.length; m++) {
    const x = c[m], key = Math.floor((x.t - 5 * 3600) / 86400);
    if (!cur || cur.key !== key) {
      if (cur) {
        closeDay();
        const d = D.length - 1; // dernier jour complet ; on compare atr[d] à la médiane de atr[d-120 .. d-1]
        if (d - medLen >= 0 && Number.isFinite(atr[d]) && Number.isFinite(atr[d - medLen])) state = atr[d] > median(atr.slice(d - medLen, d)) ? 1 : 0; else state = 0;
      }
      cur = { key, h: x.h, l: x.l, c: x.c };
    } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; }
    reg[m] = state;
  }
  return reg;
}

/** F2C sur un an civil, série continue (même code que runYearF2 de comboAN, avec placedIdx conservé). Renvoie [{ Y, r, placedIdx }]. */
export function runYearF2Idx(all, Y) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  return backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1)).map((t) => ({ Y, r: t.r, placedIdx: t.placedIdx }));
}

/** Test de Welch (moyennes inégales, variances inégales). */
export function welch(a, b) {
  const m = (x) => x.reduce((s, v) => s + v, 0) / x.length, va = (x, mu) => x.reduce((s, v) => s + (v - mu) ** 2, 0) / (x.length - 1);
  const ma = m(a), mb = m(b), sa = va(a, ma) / a.length, sb = va(b, mb) / b.length; return (ma - mb) / Math.sqrt(sa + sb);
}

/** Jugement de l'entraînement (pré-enregistré). hi/lo : R des trades 2011-2022 en régime élevé/calme ; hiA/hiB : élevé 2011-16 et 2017-22. */
export function judgeTrain({ hi, lo, hiA, hiB, nAll, f2cAvg = 0.106 }) {
  const mh = summarize(hi).avgR, ml = summarize(lo).avgR;
  const c1 = mh > ml && welch(hi, lo) >= 1.96, c2 = mh >= f2cAvg + 0.05, c3 = summarize(hiA).avgR > 0 && summarize(hiB).avgR > 0, c4 = hi.length / nAll >= 0.30;
  return { c1, c2, c3, c4, pass: c1 && c2 && c3 && c4, welch: welch(hi, lo) };
}
/** Jugement du test 2023-2025 (pré-enregistré). */
export function judgeTest({ hi, lo }) { const sh = summarize(hi), sl = summarize(lo); return sh.avgR > sl.avgR && sh.avgR > 0 && sh.t >= 1.0; }

const split = (T, reg) => ({ hi: T.filter((t) => reg[t.placedIdx] === 1), lo: T.filter((t) => reg[t.placedIdx] === 0) });
const rs = (T) => T.map((t) => t.r), inY = (T, a, b) => T.filter((t) => t.Y >= a && t.Y <= b), range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
function runYears(all, years) { const x = []; for (const Y of years) { const r = runYearF2Idx(all, Y); if (r) x.push(...r); } return x; }
const byYear = (T, reg, years) => years.map((Y) => { const { hi, lo } = split(inY(T, Y, Y), reg); return `${Y}: élevé ${summarize(rs(hi)).avgR.toFixed(2)}(${hi.length}) calme ${summarize(rs(lo)).avgR.toFixed(2)}(${lo.length})`; }).join('\n    ');

if (process.argv[1] && process.argv[1].endsWith('comboAQ_volatilite.mjs')) {
  const D = process.argv[2], MODE = process.argv[3], lines = [];
  const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };
  if (!D || !['train', 'test'].includes(MODE)) { console.error('Usage : node comboAQ_volatilite.mjs <dossier data> train|test'); process.exit(2); }
  const h = sha256Text(fs.readFileSync(PREREG_FILE, 'utf8'));
  if (h !== PREREG_SHA256) { console.error(`Pré-enregistrement modifié (SHA-256 ${h}). Aucun calcul.`); process.exit(1); }
  log(`F2 ET RÉGIME DE VOLATILITÉ (VOL1) | mode ${MODE} | pré-enregistrement SHA-256 ${h} | lancé ${new Date().toISOString()}`);

  const hist = readM1(`${D}/histdata-m1/US100.csv.gz`), brk = readM1(`${D}/real-m1-full/US100.csv.gz`), cut = brk[0][0];
  const all = toM15(hist.filter((r) => r[0] < cut).concat(brk)), reg = volRegime(all);
  const T = runYears(all, range(2011, 2026)), tr = inY(T, 2011, 2022), cs = summarize(rs(tr));
  const control = cs.n === 1222 && Math.abs(cs.totalR - 129.7) < 0.06 && Math.abs(cs.dd - 27.4) < 0.06;
  log('\nCONTRÔLE F2C 2011-2022 (attendu n=1222, R 129,7, dd 27,4) :', fmt(cs), control ? '=> OK' : '=> ÉCHEC');
  if (!control) { log('Le contrôle échoue : rien d\'autre n\'est lu.'); process.exit(1); }
  const share = reg.reduce((s, v) => s + v, 0) / reg.length;
  log(`Part des bougies en régime élevé (toute la série) : ${(share * 100).toFixed(1)} %`);

  const { hi, lo } = split(tr, reg), A = split(inY(tr, 2011, 2016), reg), B = split(inY(tr, 2017, 2022), reg);
  const j = judgeTrain({ hi: rs(hi), lo: rs(lo), hiA: rs(A.hi), hiB: rs(B.hi), nAll: tr.length });
  log('\n## ENTRAÎNEMENT US100 2011-2022');
  log('  élevé :', fmt(summarize(rs(hi))), '\n  calme :', fmt(summarize(rs(lo))));
  log(`  2011-2016 élevé ${fmt(summarize(rs(A.hi)))} | calme ${fmt(summarize(rs(A.lo)))}`);
  log(`  2017-2022 élevé ${fmt(summarize(rs(B.hi)))} | calme ${fmt(summarize(rs(B.lo)))}`);
  log(`  Welch élevé − calme : ${j.welch.toFixed(2)}`);
  log(`  Critères : 1 (élevé > calme, Welch ≥ 1,96) ${j.c1 ? 'OK' : 'NON'} | 2 (élevé ≥ 0,156) ${j.c2 ? 'OK' : 'NON'} | 3 (élevé > 0 dans les deux moitiés) ${j.c3 ? 'OK' : 'NON'} | 4 (≥ 30 % des trades) ${j.c4 ? 'OK' : 'NON'}`);
  log(`  Par an :\n    ${byYear(tr, reg, range(2011, 2022))}`);
  log(`\nENTRAÎNEMENT : ${j.pass ? 'PASSE' : 'ÉCHEC -> VOL1 rejetée'}`);
  const te = inY(T, 2023, 2025), s26 = inY(T, 2026, 2026);
  if (MODE === 'train' || !j.pass) {
    const st = split(te, reg); log(`\nTest 2023-2025 NON LU (nombres seulement) : élevé ${st.hi.length} trades, calme ${st.lo.length} trades ; 2026 : ${s26.length} trades.`);
    fs.writeFileSync(`docs/SORTIE-F2-VOLATILITE-${MODE}.txt`, lines.join('\n') + '\n'); process.exit(0);
  }
  log('\n## TEST US100 2023-2025 (lecture unique)');
  const st = split(te, reg); log('  élevé :', fmt(summarize(rs(st.hi))), '\n  calme :', fmt(summarize(rs(st.lo))));
  log(`VERDICT (pré-enregistré) : ${judgeTest({ hi: rs(st.hi), lo: rs(st.lo) }) ? 'VOL1 prometteuse' : 'VOL1 rejetée'}`);
  log('\n## DESCRIPTIF (non jugé)');
  log(`  2026 : ${byYear(s26, reg, [2026])}`);
  log(`  Par an 2023-2026 :\n    ${byYear(inY(T, 2023, 2026), reg, range(2023, 2026))}`);
  for (const sym of ['GER40', 'XAUUSD', 'US500']) {
    const a = toM15(readM1(`${D}/real-m1-full/${sym}.csv.gz`)), rg = volRegime(a), X = runYears(a, range(2023, 2026)), sp = split(X, rg);
    log(`  ${sym} broker 2023-2026 : élevé ${fmt(summarize(rs(sp.hi)))} | calme ${fmt(summarize(rs(sp.lo)))}`);
  }
  fs.writeFileSync('docs/SORTIE-F2-VOLATILITE-test.txt', lines.join('\n') + '\n');
}
