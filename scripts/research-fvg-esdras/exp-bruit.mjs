// Combien de setups le moteur produit-il pendant les 11 fenêtres des exemples d'Esdras ? (détection seule)
// Trois niveaux : (1) toutes zones FVG M15 non mitigées (partie non mangée), (2) zones du SEUL sens du trade d'Esdras,
// (3) chaîne complète déjà documentée (FVG d'entrée + direction + ligne 4hr + FVG à gauche). Lancer : node scripts/research-fvg-esdras/exp-bruit.mjs
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).href;
const { OFF } = await import(R + 'scripts/lib/m1Data.js');
const { buildZones } = await import(R + 'scripts/lib/fvgFollow.js');
const DIR = 'data/esdras-examples/';
const load = (s) => JSON.parse(fs.readFileSync(`${DIR}live-${s}.json`, 'utf8')).candles.slice(0, -1).map((c) => ({ time: c.time - OFF, open: c.open, high: c.high, low: c.low, close: c.close }));
const Z = { US100: buildZones(load('US100')), US500: buildZones(load('US500')) };
const day = (s) => Date.parse(s + 'T00:00:00Z') - OFF;
const EX = [
  ['1 US100 14/09', 'US100', 1, 28850, 28915, 20, '2026-09-13', '2026-09-16'], ['2 US100 18/09', 'US100', -1, 29610, 29650, 20, '2026-09-17', '2026-09-19'],
  ['3 US100 23/09', 'US100', -1, 30715, 30780, 20, '2026-09-22', '2026-09-24'], ['4 US100 22/09', 'US100', 1, 30510, 30545, 20, '2026-09-21', '2026-09-23'],
  ['5 US100 24/09', 'US100', 1, 30250, 30290, 20, '2026-09-23', '2026-09-25'], ['6 US500 29/09', 'US500', -1, 7697, 7703, 5, '2026-09-28', '2026-09-30'],
  ['7a US500 11/09', 'US500', 1, 7628, 7635, 5, '2026-09-10', '2026-09-12'], ['7b US500 11/09', 'US500', 1, 7620, 7626, 5, '2026-09-10', '2026-09-12'],
  ['8 US500 14/09', 'US500', 1, 7600, 7610, 5, '2026-09-13', '2026-09-16'], ['9 US500 18/09', 'US500', -1, 7660, 7670, 5, '2026-09-17', '2026-09-19'],
  ['10 US500 23/09', 'US500', -1, 7738, 7748, 5, '2026-09-22', '2026-09-24'],
];
let tot = 0, totDir = 0, totBox = 0, n = 0;
console.log("Fenêtre                 | jours | toutes zones | dans son sens | dont une touche sa boîte | setupsEsdras");
for (const [name, s, dir, lo, hi, tol, from, to] of EX) {
  const d = (day(to) - day(from)) / 86400000;
  const w = Z[s].filter((z) => z.T >= day(from) && z.T < day(to));
  const wd = w.filter((z) => z.dir === dir);
  const wb = wd.filter((z) => z.remInf <= hi + tol && z.remSup >= lo - tol);
  tot += w.length; totDir += wd.length; totBox += wb.length; n += d;
  console.log(`${name.padEnd(23)} | ${d.toFixed(0).padStart(4)} | ${String(w.length).padStart(11)} | ${String(wd.length).padStart(13)} | ${String(wb.length).padStart(27)} | ${wb.length ? '1' : '0'}`);
}
console.log(`\nTotal ${n.toFixed(0)} jours de fenêtre : ${tot} zones (${(tot / n).toFixed(1)}/jour), ${totDir} dans son sens (${(totDir / n).toFixed(1)}/jour), ${totBox} touchent une boîte d'exemple.`);
console.log('Les 11 exemples couvrent 8 journées distinctes (7a et 7b = même jour, 4 = 22/09).');