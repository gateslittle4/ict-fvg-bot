// Analyse pré-enregistrée (docs/PREREG-COMPARAISON-F2-VS-COMBO-LIVE.md). Aucune règle modifiée après lecture.
import fs from 'node:fs';
const D = 'data/live-replay';
const files = ['hist-2010-2014.json', 'hist-2014-2017.json', 'hist-2017-2020.json', 'hist-2020-2023.json'].map((f) => `${D}/${f}`).concat(['data/comparaison-f2-combo/broker-2023-2027.json']);
const all = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).trades).sort((a, b) => a.entryTime - b.entryTime).map((t) => ({ ...t, y: new Date(t.entryTime).getUTCFullYear() })).filter((t) => t.y >= 2011);
const stats = (rs, days) => { const n = rs.length, tot = rs.reduce((a, b) => a + b, 0), avg = n ? tot / n : 0, sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1)) : 0; let eq = 0, pk = 0, dd = 0; for (const r of rs) { eq += r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); } const wk = days / 7; return { n, win: n ? rs.filter((r) => r > 0).length / n : 0, tot, avg, t: sd ? avg / (sd / Math.sqrt(n)) : 0, dd, perWeek: n / wk, rPerWeek: tot / wk }; };
const fmt = (s) => `n=${String(s.n).padStart(5)} ${s.perWeek.toFixed(2).padStart(5)}/sem gagn=${(s.win * 100).toFixed(0).padStart(2)}% R=${s.tot.toFixed(1).padStart(8)} (${s.rPerWeek.toFixed(2)}/sem) moy=${s.avg.toFixed(3).padStart(7)} t=${s.t.toFixed(2).padStart(5)} dd=${s.dd.toFixed(1)}`;
const blocks = { 'A 2011-2016': [2011, 2016], 'B 2017-2022': [2017, 2022], 'Entraînement 2011-2022': [2011, 2022], 'Test 2023-2025': [2023, 2025], 'Forward 2026 (au 21/09)': [2026, 2026] };
const days = (a, b) => { const s = a === 2011 ? Date.UTC(2011, 3, 1) : Date.UTC(a, 0, 1), e = b === 2026 ? Date.UTC(2026, 8, 21) : Date.UTC(b + 1, 0, 1); return (e - s) / 86400000; };
const AB = new Set(['orb5', 'noise']);
const views = {
  '1. BOT COMPLET (vue du verdict)': () => true,
  '2. Combo sans A ni B': (t) => !AB.has(t.source),
  '3. A + B seuls': (t) => AB.has(t.source),
  '4. US100 seulement (même instrument que F2)': (t) => t.symbol === 'US100',
};
for (const [name, f] of Object.entries(views)) {
  console.log('\n## ' + name);
  for (const [bn, [a, b]] of Object.entries(blocks)) console.log(bn.padEnd(26), fmt(stats(all.filter((t) => f(t) && t.y >= a && t.y <= b).map((t) => t.r), days(a, b))));
  console.log('par an :', Array.from({ length: 16 }, (_, i) => 2011 + i).map((y) => { const rs = all.filter((t) => f(t) && t.y === y).map((t) => t.r); return `${y}:${rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) : '-'}(${rs.length})`; }).join(' '));
}
console.log('\n## 5. Par stratégie (R moyen (n) : 2011-2016 | 2017-2022 | 2023-2025 | 2026)');
const keys = [...new Set(all.map((t) => `${t.source} ${t.symbol}`))].sort();
for (const k of keys) console.log(k.padEnd(22), [[2011, 2016], [2017, 2022], [2023, 2025], [2026, 2026]].map(([a, b]) => { const rs = all.filter((t) => `${t.source} ${t.symbol}` === k && t.y >= a && t.y <= b).map((t) => t.r); return rs.length ? `${(rs.reduce((x, y) => x + y, 0) / rs.length).toFixed(3)} (${rs.length})` : '-'; }).join(' | '));
console.log('\n## Contrôle de cohérence (nb de trades, bot complet) : 2011-2016 =', all.filter((t) => t.y <= 2016).length, '(rapport vol-regime-step0 : 3250) ; 2017-2022 =', all.filter((t) => t.y >= 2017 && t.y <= 2022).length, '(rapport : 3054)');
