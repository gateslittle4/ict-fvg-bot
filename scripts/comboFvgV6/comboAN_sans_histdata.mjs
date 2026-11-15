// comboAN_sans_histdata.mjs - même étude que comboAN_autres_instruments.mjs (F2 gelée sur GER40, XAUUSD ; US500 et US100 en
// descriptif), lancée dans un environnement où data/histdata-m1/ est absent (jamais commité, histdata.com inaccessible).
// Rien n'est changé aux règles ni aux critères : on importe runYearF2 et verdict du script pré-enregistré.
// Contrôle de remplacement : US100 broker seul, 2024-2026, doit redonner trade pour trade les R de docs/DONNEES-F2-ML.csv
// (RESULTAT-F2-SERIE-CONTINUE.md : les trades 2024-2026 sont identiques avec ou sans l'historique HistData ; seule 2023 diffère).
// Usage : node --max-old-space-size=6144 scripts/comboFvgV6/comboAN_sans_histdata.mjs data docs/SORTIE-F2-AUTRES-INSTRUMENTS-SANS-HISTDATA.txt
import fs from 'node:fs';
import { readM1, summarize, dstHours } from './comboF.mjs';
import { toM15, runYearF2, verdict, sha256Text, PREREG_FILE, PREREG_SHA256, WIN_START_YEAR } from './comboAN_autres_instruments.mjs';

const D = process.argv[2], OUT = process.argv[3] || 'SORTIE-F2-AUTRES-INSTRUMENTS-SANS-HISTDATA.txt', lines = [];
const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };
if (!D) { console.error('Usage : node comboAN_sans_histdata.mjs <dossier data> [sortie]'); process.exit(2); }
const h = sha256Text(fs.readFileSync(PREREG_FILE, 'utf8'));
if (h !== PREREG_SHA256) { console.error('Pré-enregistrement modifié, aucun calcul.'); process.exit(1); }
log('F2 GELÉE SUR D\'AUTRES INSTRUMENTS (sans HistData) | pré-enregistrement SHA-256', h, '| lancé', new Date().toISOString());

const LABELS = { REPLIQUEE: 'Répliquée', COMPATIBLE_NON_PROUVEE: 'Compatible, non prouvée', INDISCERNABLE_DU_ZERO: 'Indiscernable du zéro', NON_REPLIQUEE: 'Non répliquée' };
const fmtS = (s) => `n=${String(s.n).padStart(4)} gagn=${(s.win * 100).toFixed(0).padStart(2)}% R=${s.totalR.toFixed(1).padStart(7)} moy=${s.avgR.toFixed(3).padStart(6)} t=${s.t.toFixed(2).padStart(5)} dd=${s.dd.toFixed(1)}`;
const rsOf = (x) => x.map((t) => t.r), inYears = (x, a, b) => x.filter((t) => t.Y >= a && t.Y <= b), range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const load = (sym) => toM15(readM1(`${D}/real-m1-full/${sym}.csv.gz`));
function runYears(all, years, opt) { const x = []; for (const Y of years) { const r = runYearF2(all, Y, opt); if (r) x.push(...r); } return x; }
const weeksOf = (all) => (all[all.length - 1].raw - Math.max(all[0].raw, Date.UTC(WIN_START_YEAR, 0, 1))) / (7 * 86400000);
const Y23 = range(WIN_START_YEAR, 2026);

// ---- contrôle de remplacement : US100 broker seul 2024-2026 contre DONNEES-F2-ML.csv ----
const csv = fs.readFileSync(new URL('../../docs/DONNEES-F2-ML.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
// placedT du moteur = raw/1000 + heure d'été US (toM15) ; le CSV donne placedRaw en ms UTC.
const ref = csv.filter((r) => +r[0] >= 2024).map((r) => ({ Y: +r[0], placedRaw: +r[3] / 1000 + dstHours(+r[3]) * 3600, r: +r[4] }));
const us100 = load('US100'), u100 = runYears(us100, Y23, {}), u100c = inYears(u100, 2024, 2026);
const refKey = new Map(ref.map((t) => [`${t.Y}:${t.placedRaw}:${t.r.toFixed(6)}`, 1]));
const matched = u100c.filter((t) => refKey.has(`${t.Y}:${t.placedT}:${t.r.toFixed(6)}`)).length;
const sRef = summarize(ref.map((t) => t.r)), sGot = summarize(rsOf(u100c));
const control = u100c.length === ref.length && matched === ref.length && Math.abs(sRef.totalR - sGot.totalR) < 0.01;
log(`\nCONTRÔLE DE REMPLACEMENT US100 broker 2024-2026 contre DONNEES-F2-ML.csv : attendu ${fmtS(sRef)} | obtenu ${fmtS(sGot)} | trades identiques ${matched}/${ref.length}`, control ? '=> OK' : '=> ÉCHEC');
log(`(2023 broker seul : ${inYears(u100, 2023, 2023).length} trades ; série continue : ${csv.filter((r) => r[0] === '2023').length} ; différence attendue, voir RESULTAT-F2-SERIE-CONTINUE.md)`);
if (!control) { log('Le contrôle échoue : rien d\'autre n\'est lu.'); fs.writeFileSync(OUT, lines.join('\n') + '\n'); process.exit(1); }

// ---- principal ----
const prim = {}, primAll = [];
log('\n## PRINCIPAL : GER40 et XAUUSD, 2023-01-01 -> dernière bougie');
for (const sym of ['GER40', 'XAUUSD']) {
  const all = load(sym), x = runYears(all, Y23, {}); prim[sym] = x; prim[sym + '_all'] = all; primAll.push(...x);
  log(`\n${sym} : M15 ${all.length}, de ${iso(all[0].raw)} à ${iso(all[all.length - 1].raw)} UTC | trades/semaine ${(x.length / weeksOf(all)).toFixed(2)}`);
  log('  2023-2026 ', fmtS(summarize(rsOf(x))));
  log('  2023-2024 ', fmtS(summarize(rsOf(inYears(x, 2023, 2024)))));
  log('  2025-2026 ', fmtS(summarize(rsOf(inYears(x, 2025, 2026)))));
  log('  par an    ', Y23.map((Y) => { const s = summarize(rsOf(inYears(x, Y, Y))); return `${Y}: ${s.avgR.toFixed(2)}(${s.n})`; }).join('  '));
}
const pooled = summarize(rsOf(primAll)), hA = summarize(rsOf(inYears(primAll, 2023, 2024))), hB = summarize(rsOf(inYears(primAll, 2025, 2026)));
const v = verdict({ pooled, halves: [hA.avgR, hB.avgR], perInstrument: ['GER40', 'XAUUSD'].map((s) => summarize(rsOf(prim[s])).avgR), control });
log('\nPOOLÉ GER40 + XAUUSD :', fmtS(pooled), '\n  2023-2024 :', fmtS(hA), '\n  2025-2026 :', fmtS(hB));
log(`\nVERDICT (pré-enregistré) : ${LABELS[v]}`);

// ---- secondaire ----
log('\n## SECONDAIRE (descriptif) : US500 et US100, broker 2023-2026 (HistData 2011-2022 indisponible ici)');
const us500 = load('US500'), u500 = runYears(us500, Y23, {});
log('  US500 2023-2026 ', fmtS(summarize(rsOf(u500))), '| par an', Y23.map((Y) => { const s = summarize(rsOf(inYears(u500, Y, Y))); return `${Y}: ${s.avgR.toFixed(2)}(${s.n})`; }).join('  '));
log('  US100 2023-2026 ', fmtS(summarize(rsOf(u100))), '| par an', Y23.map((Y) => { const s = summarize(rsOf(inYears(u100, Y, Y))); return `${Y}: ${s.avgR.toFixed(2)}(${s.n})`; }).join('  '));
const u100keys = new Set(u100.map((t) => t.placedT));
log(`  Recouvrement : ${u500.filter((t) => u100keys.has(t.placedT)).length} ordres US500 sur ${u500.length} posés à la même bougie qu'un ordre US100`);

log('\n## DESCRIPTIF 2023-2026 : coûts et filtre de balayage (non jugé)');
for (const [sym, all] of [['GER40', prim.GER40_all], ['XAUUSD', prim.XAUUSD_all], ['US500', us500], ['US100', us100]]) {
  log(`\n${sym}`);
  for (const [lab, opt] of [['F2 (spread du projet)', {}], ['F2 spread nul', { spreadMult: 0 }], ['F2 spread x2', { spreadMult: 2 }], ['achats sans filtre de balayage', { raw: true }]]) log(' ', lab.padEnd(32), fmtS(summarize(rsOf(runYears(all, Y23, opt)))));
}
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8'); console.error('Sortie écrite dans', OUT);
