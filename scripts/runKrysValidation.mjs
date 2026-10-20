// runKrysValidation.mjs - test hors échantillon des règles v2 figées (voir REGLES-V2-FIGEES.md). Usage : node scripts/runKrysValidation.mjs <fichier.csv> [...]
import fs from 'node:fs';
import { backtest, stats, h4SweepFilter } from './lib/krysBacktest.js';

const nyOffset = (ms) => { // décalage NY en secondes (heure locale = UTC + offset), DST réel
  const d = new Date(ms); const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t) => +f.find((x) => x.type === t).value; const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')); return Math.round((local - Math.floor(ms / 60000) * 60000) / 1000);
};
export function loadCsv(file) {
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(',').map(Number));
  // t' tel que (t' - 5 h) = heure locale NY réelle (les modules utilisent UTC-5 fixe)
  return rows.map(([ms, o, h, l, c]) => ({ t: ms / 1000 + (nyOffset(ms) + 5 * 3600), o, h, l, c, raw: ms }));
}
const REF = 8200; // prix de l'échantillon d'ajustement (simulateur) : les valeurs en points sont proportionnelles au prix
export function run(c, over = {}) {
  const px = c.slice(700).reduce((s, k) => s + k.c, 0) / (c.length - 700), k = px / REF;
  const opt = { start: 700, spread: 0.6 * k, stopMargin: 3 * k, minRR: 4, tpMode: '3r', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5, ...over };
  const filter = over.noH4 ? undefined : h4SweepFilter(c, { N: 6, W: over.W || 32 });
  const r = backtest(c, { ...opt, filter });
  const half = Math.floor((700 + c.length) / 2), t = r.trades;
  return { k: +k.toFixed(2), all: stats(t), A: stats(t.filter((x) => x.fillIdx < half)), B: stats(t.filter((x) => x.fillIdx >= half)), trades: t };
}
const show = (n, r) => `${n.padEnd(34)} n=${String(r.all.n).padStart(3)} gagnants=${(r.all.winRate * 100).toFixed(0)}% R=${r.all.totalR.toFixed(1).padStart(6)} moy=${r.all.avgR.toFixed(2)} dd=${r.all.maxDrawdownR.toFixed(1)} série=${r.all.maxLossStreak} | 1re moitié ${r.A.totalR.toFixed(1)} (${r.A.n}) 2e ${r.B.totalR.toFixed(1)} (${r.B.n})`;
if (process.argv[1].endsWith('runKrysValidation.mjs')) {
  for (const f of process.argv.slice(2)) {
    const c = loadCsv(f); console.log(`\n=== ${f.split(/[\\/]/).pop()} : ${c.length} bougies, échelle prix x${run(c).k} ===`);
    console.log(show('v2 figée (TP fixe 4R)', run(c)));
    console.log(show('variante spec : max(moitié FVG, 4R)', run(c, { tpMode: 'half' })));
    console.log(show('sans filtre H4', run(c, { noH4: true })));
    for (const [n, o] of [['marge x0.67', { stopMargin: 2 }], ['marge x1.33', { stopMargin: 4 }], ['minRR 3', { minRR: 3 }], ['minRR 5', { minRR: 5 }], ['âge 6', { maxAge: 6 }], ['âge 10', { maxAge: 10 }], ['H4 W=16', { W: 16 }], ['H4 W=48', { W: 48 }]]) {
      const base = run(c); const k = base.k; const over = { ...o }; if (o.stopMargin) over.stopMargin = o.stopMargin * k;
      console.log(show('robustesse ' + n, run(c, over)));
    }
  }
}
