#!/usr/bin/env node
// buildHistdataM1.js
// Usage: node scripts/buildHistdataM1.js <dossier des zips HistData> [US100,US500,XAUUSD,EURUSD]
//
// Convertit les zips HistData.com « ASCII 1-minute bar quotes » (un par paire et par année, ex. nsxusd_2015.zip,
// téléchargés depuis histdata.com/get.php) en data/histdata-m1/<paire>.csv.gz, au même format que data/real-m1-full
// (time en ms UTC, open, high, low, close) pour que les scripts les lisent comme l'historique du broker.
// HistData annonce « EST sans heure d'été » mais l'heure est en fait celle de New York AVEC heure d'été (vérifié
// 2026-09-23 sur le recouvrement avec le broker en 2022 : CPI du 13 juillet à 13:30 au lieu de 12:30 UTC, NFP de
// décembre aligné) : UTC = heure HistData + 4 h en heure d'été (2e dimanche de mars -> 1er dimanche de novembre), + 5 h sinon.
// Données brutes, jamais commitées (data/histdata-m1/ est dans .gitignore).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const DIR = process.argv[2];
if (!DIR) { console.error('Usage: node scripts/buildHistdataM1.js <dossier des zips>'); process.exit(1); }
const PAIRS = { nsxusd: 'US100', spxusd: 'US500', xauusd: 'XAUUSD', eurusd: 'EURUSD' };
// Heure de New York (règles US depuis 2007) -> ms UTC.
const sundayOf = (y, m, nth) => { const d = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - d) % 7) + 7 * (nth - 1); };
function nyToUtc(y, mo, d, h, mi, s) {
  const local = Date.UTC(y, mo, d, h, mi, s);
  const dstStart = Date.UTC(y, 2, sundayOf(y, 2, 2), 2); const dstEnd = Date.UTC(y, 10, sundayOf(y, 10, 1), 2);
  return local + (local >= dstStart && local < dstEnd ? 4 : 5) * 3600000;
}
fs.mkdirSync('data/histdata-m1', { recursive: true });

const ONLY = process.argv[3]?.split(',');
for (const [pair, sym] of Object.entries(PAIRS)) {
  if (ONLY && !ONLY.includes(sym)) continue;
  const zips = fs.readdirSync(DIR).filter((f) => f.startsWith(`${pair}_`) && f.endsWith('.zip')).sort();
  if (!zips.length) { console.log(`${sym} : aucun zip`); continue; }
  // Fichiers annuels dans l'ordre : on garde chaque minute une seule fois (strictement croissante).
  const out = ['time,open,high,low,close']; let last = -Infinity; let first = null;
  for (const z of zips) {
    const csv = execFileSync('unzip', ['-p', `${DIR}/${z}`, '*.csv'], { maxBuffer: 1 << 30 }).toString('latin1');
    let pos = 0;
    while (pos < csv.length) {
      let end = csv.indexOf('\n', pos); if (end < 0) end = csv.length;
      const line = csv.slice(pos, end).trim(); pos = end + 1;
      if (line.length < 20) continue;
      const t = nyToUtc(+line.slice(0, 4), +line.slice(4, 6) - 1, +line.slice(6, 8), +line.slice(9, 11), +line.slice(11, 13), +line.slice(13, 15));
      if (!(t > last)) continue;
      const p = line.slice(16).split(';');
      out.push(`${t},${+p[0]},${+p[1]},${+p[2]},${+p[3]}`); last = t; first ??= t;
    }
  }
  fs.writeFileSync(`data/histdata-m1/${sym}.csv.gz`, zlib.gzipSync(out.join('\n'), { level: 4 }));
  console.log(`${sym} : ${out.length - 1} bougies M1, ${new Date(first).toISOString().slice(0, 16)} -> ${new Date(last).toISOString().slice(0, 16)} UTC (${zips.length} fichiers)`);
}
