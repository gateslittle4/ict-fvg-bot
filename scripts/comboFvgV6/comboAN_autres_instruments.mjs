// comboAN_autres_instruments.mjs - F2 GELÉE appliquée à d'autres instruments (GER40, XAUUSD ; US500 en descriptif). Règles et critères FIGÉS :
// voir docs/PREREG-F2-AUTRES-INSTRUMENTS.md (écrit avant tout calcul). Le script refuse de tourner si ce fichier a été modifié.
// Usage : node --max-old-space-size=6144 comboAN_autres_instruments.mjs <dossier data> [fichier de sortie]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readM1, dstHours, RULES, summarize } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';

export const PREREG_FILE = fileURLToPath(new URL('../../docs/PREREG-F2-AUTRES-INSTRUMENTS.md', import.meta.url));
export const PREREG_SHA256 = '9222a76a4cebb4541b9c7f5bf27ba3352a2b8ccea60f9d0f972fd640942fe764';
export const T_OK = 1.96, T_FLOOR = 1.0, WIN_START_YEAR = 2023;

/** SHA-256 d'un texte, fins de ligne normalisées (\r\n -> \n) pour que Windows et Linux donnent la même empreinte. */
export const sha256Text = (txt) => crypto.createHash('sha256').update(txt.replace(/\r\n/g, '\n'), 'utf8').digest('hex');

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** M1 -> M15 (copie à l'identique de toM15 de comboF.mjs : temps moteur t = UTC + heure d'été US, raw = UTC en ms). */
export function toM15(rows) {
  const out = []; let cur = null;
  for (const [ms, o, h, l, c] of rows) {
    const b = Math.floor(ms / 900000);
    if (!cur || cur.b !== b) { if (cur) out.push(cur); cur = { b, raw: b * 900000, o, h, l, c }; }
    else { if (h > cur.h) cur.h = h; if (l < cur.l) cur.l = l; cur.c = c; }
  }
  if (cur) out.push(cur);
  return out.map((x) => ({ t: x.raw / 1000 + dstHours(x.raw) * 3600, o: x.o, h: x.h, l: x.l, c: x.c, raw: x.raw }));
}

/** Charge un instrument. US100 et US500 : HistData jusqu'au début du broker, puis broker. GER40 et XAUUSD : broker seulement. */
export function loadInstrument(D, sym) {
  const brk = readM1(`${D}/real-m1-full/${sym}.csv.gz`);
  if (sym === 'US100' || sym === 'US500') { const hist = readM1(`${D}/histdata-m1/${sym}.csv.gz`), cut = brk[0][0]; return toM15(hist.filter((r) => r[0] < cut).concat(brk)); }
  return toM15(brk);
}

/** F2C sur un an civil, série continue (même code que runYearTRaw de comboT.mjs). raw : achats sans filtre de balayage. spreadMult : multiplicateur du spread (descriptif). */
export function runYearF2(all, Y, { raw = false, spreadMult = 1 } = {}) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = raw ? null : h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const o = { start, spread: RULES.spread * k * spreadMult, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  return backtest(c, { ...o, filter: (a) => a.z.dir > 0 && (raw || sw(a)) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1)).map((t) => ({ Y, r: t.r, why: t.why, placedT: t.t }));
}

/** Verdict du pré-enregistrement. pooled = { avgR, t }, halves = [moyenne 2023-24, moyenne 2025-26], perInstrument = [moyennes], control = booléen. */
export function verdict({ pooled, halves, perInstrument, control }) {
  const full = pooled.avgR > 0 && pooled.t >= T_OK && halves.every((h) => h > 0) && perInstrument.every((m) => m >= 0) && control;
  if (full) return 'REPLIQUEE';
  if (pooled.avgR > 0 && pooled.t >= T_FLOOR) return 'COMPATIBLE_NON_PROUVEE';
  if (pooled.avgR > 0) return 'INDISCERNABLE_DU_ZERO';
  return 'NON_REPLIQUEE';
}

const LABELS = { REPLIQUEE: 'Répliquée', COMPATIBLE_NON_PROUVEE: 'Compatible, non prouvée', INDISCERNABLE_DU_ZERO: 'Indiscernable du zéro', NON_REPLIQUEE: 'Non répliquée' };
const fmtS = (s) => `n=${String(s.n).padStart(4)} gagn=${(s.win * 100).toFixed(0).padStart(2)}% R=${s.totalR.toFixed(1).padStart(7)} moy=${s.avgR.toFixed(3).padStart(6)} t=${s.t.toFixed(2).padStart(5)} dd=${s.dd.toFixed(1)}`;
const rsOf = (x) => x.map((t) => t.r);
const inYears = (x, a, b) => x.filter((t) => t.Y >= a && t.Y <= b);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

function runYears(all, years, opt) { const x = []; for (const Y of years) { const r = runYearF2(all, Y, opt); if (r) x.push(...r); } return x; }
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const weeksOf = (all) => (all[all.length - 1].raw - Math.max(all[0].raw, t0(WIN_START_YEAR))) / (7 * 86400000);

if (process.argv[1] && process.argv[1].endsWith('comboAN_autres_instruments.mjs')) {
  const D = process.argv[2], OUT = process.argv[3] || 'SORTIE-F2-AUTRES-INSTRUMENTS.txt', lines = [];
  const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };
  if (!D) { console.error('Usage : node comboAN_autres_instruments.mjs <dossier data> [fichier de sortie]'); process.exit(2); }
  if (!fs.existsSync(PREREG_FILE)) { console.error('Pré-enregistrement introuvable :', PREREG_FILE, '-> aucun calcul sans lui.'); process.exit(1); }
  const h = sha256Text(fs.readFileSync(PREREG_FILE, 'utf8'));
  if (h !== PREREG_SHA256) { console.error(`Le pré-enregistrement a été modifié (SHA-256 ${h}, attendu ${PREREG_SHA256}). Aucun calcul.`); process.exit(1); }
  log('F2 GELÉE SUR D\'AUTRES INSTRUMENTS | pré-enregistrement SHA-256', h, '| lancé', new Date().toISOString());

  // ---- contrôle : US100, F2C 2011-2022 ----
  const us100 = loadInstrument(D, 'US100'), ctl = runYears(us100, range(2011, 2022), {}), cs = summarize(rsOf(ctl));
  const control = cs.n === 1222 && Math.abs(cs.totalR - 129.7) < 0.06 && Math.abs(cs.dd - 27.4) < 0.06;
  log('\nCONTRÔLE US100 F2C 2011-2022 (attendu n=1222, R total 129,7, pire baisse 27,4) :', fmtS(cs), control ? '=> OK' : '=> ÉCHEC');
  if (!control) { log('Le contrôle échoue : rien d\'autre n\'est lu.'); fs.writeFileSync(OUT, lines.join('\n') + '\n'); process.exit(1); }

  // ---- principal : GER40 + XAUUSD, 2023 -> fin ----
  const Y23 = range(WIN_START_YEAR, 2026), prim = {}, primAll = [];
  log('\n## PRINCIPAL : GER40 et XAUUSD, 2023-01-01 -> dernière bougie');
  for (const sym of ['GER40', 'XAUUSD']) {
    const all = loadInstrument(D, sym), x = runYears(all, Y23, {}); prim[sym] = x; primAll.push(...x);
    const wk = weeksOf(all);
    log(`\n${sym} : M15 ${all.length}, de ${iso(all[0].raw)} à ${iso(all[all.length - 1].raw)} UTC | trades/semaine ${(x.length / wk).toFixed(2)}`);
    log('  2023-2026 ', fmtS(summarize(rsOf(x))));
    log('  2023-2024 ', fmtS(summarize(rsOf(inYears(x, 2023, 2024)))));
    log('  2025-2026 ', fmtS(summarize(rsOf(inYears(x, 2025, 2026)))));
    log('  par an    ', Y23.map((Y) => { const s = summarize(rsOf(inYears(x, Y, Y))); return `${Y}: ${s.avgR.toFixed(2)}(${s.n})`; }).join('  '));
    prim[sym + '_all'] = all;
  }
  const pooled = summarize(rsOf(primAll)), hA = summarize(rsOf(inYears(primAll, 2023, 2024))), hB = summarize(rsOf(inYears(primAll, 2025, 2026)));
  const v = verdict({ pooled, halves: [hA.avgR, hB.avgR], perInstrument: ['GER40', 'XAUUSD'].map((s) => summarize(rsOf(prim[s])).avgR), control });
  log('\nPOOLÉ GER40 + XAUUSD :', fmtS(pooled), '\n  2023-2024 :', fmtS(hA), '\n  2025-2026 :', fmtS(hB));
  log(`\nVERDICT (pré-enregistré) : ${LABELS[v]}`);
  log('Rappel : puissance faible (environ 40 % de chances de passer t >= 1,96 si le vrai R moyen était +0,106) ; ne prouve ni ne réfute F2 à lui seul.');

  // ---- secondaire : US500 (corrélé à US100), puis US100 2023-2026 pour comparer ----
  log('\n## SECONDAIRE (descriptif, corrélé à US100) : US500');
  const us500 = loadInstrument(D, 'US500'), u5 = [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2023-2026', 2023, 2026]].map(([lab, a, b]) => [lab, runYears(us500, range(a, b), {})]);
  for (const [lab, x] of u5) log(' ', lab.padEnd(10), fmtS(summarize(rsOf(x))));
  const u100recent = runYears(us100, Y23, {}), u100keys = new Set(u100recent.map((t) => t.placedT)), u500recent = u5[2][1];
  log(`  US100 2023-2026 (référence) : ${fmtS(summarize(rsOf(u100recent)))}`);
  log(`  Recouvrement 2023-2026 : ${u500recent.filter((t) => u100keys.has(t.placedT)).length} ordres US500 sur ${u500recent.length} sont posés à la même bougie qu'un ordre US100`);

  // ---- sensibilité aux coûts et sans filtre de balayage (descriptif) ----
  log('\n## DESCRIPTIF 2023-2026 : coûts et filtre de balayage (non jugé)');
  const sets = [['GER40', prim.GER40_all], ['XAUUSD', prim.XAUUSD_all], ['US500', us500], ['US100', us100]];
  for (const [sym, all] of sets) {
    log(`\n${sym}`);
    for (const [lab, opt] of [['F2 (spread du projet)', {}], ['F2 spread nul', { spreadMult: 0 }], ['F2 spread x2', { spreadMult: 2 }], ['achats sans filtre de balayage', { raw: true }]]) log(' ', lab.padEnd(32), fmtS(summarize(rsOf(runYears(all, Y23, opt)))));
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8'); console.error('Sortie écrite dans', OUT);
}
