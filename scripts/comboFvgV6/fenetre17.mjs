// Variante demandée le 2026-10-06 APRÈS avoir vu les résultats de la v6 : plage 06:00–17:00 NY, aucun filtre H4. Exploratoire (hypothèse déclarée avant calcul : 2 variantes, achats seuls / achats+ventes).
import fs from 'node:fs';
import { loadAll, runYear, RULES, summarize, fmt } from './comboV6.mjs';
RULES.hourTo = 17;
const all = loadAll(), res = {};
for (const v of ['raw_buys', 'raw_both']) { res[v] = {}; for (let Y = 2011; Y <= 2026; Y++) { const r = runYear(all, Y, v); if (r) res[v][Y] = r; } }
fs.writeFileSync('results17.json', JSON.stringify(res));
const blocks = { 'ENTRAÎNEMENT A 2011-2016': [2011, 2016], 'ENTRAÎNEMENT B 2017-2022': [2017, 2022], 'ENTRAÎNEMENT 2011-2022': [2011, 2022], 'TEST 2023-2025': [2023, 2025], 'FORWARD 2026': [2026, 2026] };
for (const v of Object.keys(res)) {
  console.log('\n##', v, '06:00-17:00');
  for (const [nm, [a, b]] of Object.entries(blocks)) { const rs = []; for (let Y = a; Y <= b; Y++) if (res[v][Y]) rs.push(...res[v][Y].trades); console.log(nm.padEnd(26), fmt(summarize(rs))); }
  console.log('par an :', Object.values(res[v]).map((r) => `${r.Y}: ${summarize(r.trades).avgR.toFixed(2)}(${r.trades.length})`).join('  '));
  const n = [2023, 2024, 2025].reduce((s, Y) => s + res[v][Y].trades.length, 0) / 3 / 52; console.log('trades par semaine 2023-25 :', n.toFixed(1));
}
