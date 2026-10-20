// comboAO_ml_extraction.mjs - extrait les trades de F2C (US100, 2011-2026) avec 7 variables connues à la pose de l'ordre.
// Règles et critères FIGÉS : voir docs/PREREG-F2-ML-FILTRE.md (écrit avant tout calcul). Le script refuse de tourner si ce fichier a été modifié.
// Usage : node --max-old-space-size=6144 comboAO_ml_extraction.mjs <dossier data> [fichier CSV de sortie]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RULES, summarize } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { nyHour } from './lib/krysMethod.js';
import { loadInstrument, sha256Text } from './comboAN_autres_instruments.mjs';

export const PREREG_FILE = fileURLToPath(new URL('../../docs/PREREG-F2-ML-FILTRE.md', import.meta.url));
export const PREREG_SHA256 = 'b2870bd2ac59079d4d7d8b9625e624d148db10053ddc72ddbf4ba6ec1e15502f';
export const ATR_N = 14;

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** ATR sur ATR_N bougies M15 se terminant à la bougie idx (incluse). Retourne aussi l'indice le plus récent lu (pour le contrôle anti-regard-vers-l'avant). */
export function atrAt(c, idx, n = ATR_N) {
  let s = 0, cnt = 0;
  for (let q = Math.max(1, idx - n + 1); q <= idx; q++) { s += Math.max(c[q].h - c[q].l, Math.abs(c[q].h - c[q - 1].c), Math.abs(c[q].l - c[q - 1].c)); cnt++; }
  return { atr: cnt ? s / cnt : NaN, lastIdx: idx };
}

/** Les 7 variables du pré-enregistrement, à partir d'un trade F2C et des bougies. */
export function features(tr, c) {
  const { atr, lastIdx } = atrAt(c, tr.placedIdx);
  if (lastIdx > tr.placedIdx) throw new Error('regard vers l\'avant');
  const rr = (tr.tp - tr.entry) / tr.risk, zoneH = (tr.zone0[1] - tr.zone0[0]) / tr.risk;
  const hr = nyHour(tr.t), d = new Date((tr.t - 5 * 3600) * 1000).getUTCDay();
  return { x1_lnRisqueATR: Math.log(tr.risk / atr), x2_lnRRprevu: Math.log(rr), x3_age: tr.placedIdx - tr.zCreated, x4_hauteurFVGsurRisque: zoneH, x5_h09_12: hr >= 9 && hr < 12 ? 1 : 0, x6_h12_16: hr >= 12 && hr < 16 ? 1 : 0, x7_lundi: d === 1 ? 1 : 0 };
}

/** F2C sur un an civil, série continue (même code que runYearF2 de comboAN, mais en gardant les champs de l'ordre). */
export function runYearF2Full(all, Y) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  return backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1)).map((t) => ({ Y, t, c }));
}

if (process.argv[1] && process.argv[1].endsWith('comboAO_ml_extraction.mjs')) {
  const D = process.argv[2], OUT = process.argv[3] || 'DONNEES-F2-ML.csv';
  if (!D) { console.error('Usage : node comboAO_ml_extraction.mjs <dossier data> [fichier CSV]'); process.exit(2); }
  if (!fs.existsSync(PREREG_FILE)) { console.error('Pré-enregistrement introuvable :', PREREG_FILE, '-> aucun calcul sans lui.'); process.exit(1); }
  const h = sha256Text(fs.readFileSync(PREREG_FILE, 'utf8'));
  if (h !== PREREG_SHA256) { console.error(`Le pré-enregistrement a été modifié (SHA-256 ${h}, attendu ${PREREG_SHA256}). Aucun calcul.`); process.exit(1); }
  console.log('F2 ML | pré-enregistrement SHA-256', h, '| lancé', new Date().toISOString());
  const all = loadInstrument(D, 'US100'), rows = [];
  for (let Y = 2011; Y <= 2026; Y++) {
    const r = runYearF2Full(all, Y); if (!r) continue;
    for (const { t, c } of r) rows.push({ Y, fillRaw: c[t.fillIdx].raw, exitRaw: c[t.exitIdx].raw, placedRaw: c[t.placedIdx].raw, r: t.r, why: t.why, ...features(t, c) });
  }
  rows.sort((a, b) => a.fillRaw - b.fillRaw);
  const ctl = summarize(rows.filter((x) => x.Y <= 2022).map((x) => x.r));
  const control = ctl.n === 1222 && Math.abs(ctl.totalR - 129.7) < 0.06 && Math.abs(ctl.dd - 27.4) < 0.06;
  console.log('CONTRÔLE US100 F2C 2011-2022 (attendu n=1222, R total 129,7, pire baisse 27,4) :', JSON.stringify(ctl), control ? '=> OK' : '=> ÉCHEC');
  if (!control) { console.log('Le contrôle échoue : rien d\'autre n\'est lu.'); process.exit(1); }
  if (rows.some((x) => Object.values(x).some((v) => typeof v === 'number' && !Number.isFinite(v)))) { console.error('valeur non finie dans les variables'); process.exit(1); }
  const cols = Object.keys(rows[0]);
  fs.writeFileSync(OUT, cols.join(',') + '\n' + rows.map((x) => cols.map((k) => x[k]).join(',')).join('\n') + '\n');
  console.log('trades écrits :', rows.length, '->', OUT);
}
