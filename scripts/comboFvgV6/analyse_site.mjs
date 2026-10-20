// Analyse pré-enregistrée (docs/PREREG-COMPARAISON-F2-VS-SITE.md). Aucune règle modifiée après lecture.
import fs from 'node:fs';
const OFF = 5 * 3600000; // engine time = UTC - 5 h fixe (FIXED_EST_TO_UTC_OFFSET_MS)
const C = 'data/clean-study-cache-resting';
const raw = [...JSON.parse(fs.readFileSync(`${C}/fvg-US100-rr5-hist.json`)), ...JSON.parse(fs.readFileSync(`${C}/fvg-US100-rr5-broker.json`))].sort((a, b) => a.entryTime - b.entryTime);
const yr = (t) => new Date(t.entryTime + OFF).getUTCFullYear(); // heure moteur = NY fixe ; l'année est la même sauf la 1re heure
const tr = raw.map((t) => ({ ...t, y: new Date(t.entryTime).getUTCFullYear() }));
const rP = (t) => t.gross - (0.6 * (t.price / 8200)) / t.distance; // coûts F2 : spread 0,6 x prix/8200, sans swap
const stats = (rs, days) => { const n = rs.length, tot = rs.reduce((a, b) => a + b, 0), avg = n ? tot / n : 0, sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1)) : 0; let eq = 0, pk = 0, dd = 0; for (const r of rs) { eq += r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); } return { n, win: n ? rs.filter((r) => r > 0).length / n : 0, tot, avg, t: sd ? avg / (sd / Math.sqrt(n)) : 0, dd, perWeek: n / (days / 7) }; };
const fmt = (s) => `n=${String(s.n).padStart(5)} ${s.perWeek.toFixed(2)}/sem gagn=${(s.win * 100).toFixed(0).padStart(2)}% R=${s.tot.toFixed(1).padStart(8)} moy=${s.avg.toFixed(3).padStart(7)} t=${s.t.toFixed(2).padStart(5)} dd=${s.dd.toFixed(1)}`;
const blocks = { 'A 2011-2016': [2011, 2016], 'B 2017-2022': [2017, 2022], 'Entraînement 2011-2022': [2011, 2022], 'Test 2023-2025': [2023, 2025], 'Forward 2026 (au 21/09)': [2026, 2026] };
const days = (a, b) => { const end = b === 2026 ? Date.UTC(2026, 8, 21) : Date.UTC(b + 1, 0, 1); return (end - Date.UTC(a, 0, 1)) / 86400000; };
const subsets = { 'SITE tout (achats+ventes)': () => true, 'SITE achats seuls': (t) => t.direction === 'bullish', 'SITE ventes seules': (t) => t.direction !== 'bullish' };
for (const [name, f] of Object.entries(subsets)) {
  console.log('\n## ' + name + ' — coûts F2 (principal)');
  for (const [bn, [a, b]] of Object.entries(blocks)) console.log(bn.padEnd(26), fmt(stats(tr.filter((t) => f(t) && t.y >= a && t.y <= b).map(rP), days(a, b))));
  console.log('par an :', Array.from({ length: 16 }, (_, i) => 2011 + i).map((y) => { const rs = tr.filter((t) => f(t) && t.y === y).map(rP); return `${y}:${rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) : '-'}(${rs.length})`; }).join(' '));
}
console.log('\n## Contrôle de réplication (R BRUT, tous trades, achats+ventes)');
const g = (a, b) => tr.filter((t) => t.y >= a && t.y <= b).reduce((s, t) => s + t.gross, 0);
console.log(`2010-2022 : ${g(2010, 2022).toFixed(1)} (projet : -229)  | 2023-2025 : ${g(2023, 2025).toFixed(1)} (projet : -13)  | 2026 : ${g(2026, 2026).toFixed(1)} (projet : -25)`);
