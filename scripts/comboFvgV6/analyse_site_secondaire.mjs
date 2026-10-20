// Secondaire (descriptif) : coûts propres au site = copie des fonctions swapR/costR de scripts/runCleanStudy.js
import fs from 'node:fs'; import zlib from 'node:zlib';
const OFF = 5 * 3600000, DAY = 86400000, SW = { long: -43.7, short: 18.4, pip: 0.1, triple: 5 }, ROLL = (21 - 5) * 3600000;
const txt = zlib.gunzipSync(fs.readFileSync('data/real-m1-full/US100.csv.gz')).toString('latin1').trimEnd(); const REF = +txt.slice(txt.lastIndexOf('\n') + 1).split(',')[4];
function swapR(dir, distance, fill, exit) { const perDay = (dir === 'bullish' ? SW.long : SW.short) * SW.pip; let n = 0, tau = Math.floor(fill / DAY) * DAY + ROLL; if (tau <= fill) tau += DAY; for (; tau <= exit; tau += DAY) { const d = new Date(tau + OFF).getUTCDay(); if (d === 0 || d === 6) continue; n += d === SW.triple ? 3 : 1; } return (n * perDay) / distance; }
const C = 'data/clean-study-cache-resting';
const tr = [...JSON.parse(fs.readFileSync(`${C}/fvg-US100-rr5-hist.json`)), ...JSON.parse(fs.readFileSync(`${C}/fvg-US100-rr5-broker.json`))].map((t) => { const k = t.price / REF; return { ...t, y: new Date(t.entryTime).getUTCFullYear(), r: t.gross - 0.6 * k / t.distance + swapR(t.direction, t.distance / k, t.fillTime, t.exitTime) }; });
const B = { '2011-2016': [2011, 2016], '2017-2022': [2017, 2022], '2011-2022': [2011, 2022], '2023-2025': [2023, 2025], '2026': [2026, 2026] };
console.log('REF prix broker =', REF);
for (const [n, [a, b]] of Object.entries(B)) { const rs = tr.filter((t) => t.y >= a && t.y <= b).map((t) => t.r); const m = rs.reduce((x, y) => x + y, 0) / rs.length; const sd = Math.sqrt(rs.reduce((x, y) => x + (y - m) ** 2, 0) / (rs.length - 1)); console.log(n.padEnd(10), `n=${rs.length} R=${(m * rs.length).toFixed(1)} moy=${m.toFixed(3)} t=${(m / (sd / Math.sqrt(rs.length))).toFixed(2)}`); }
