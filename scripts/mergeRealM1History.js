#!/usr/bin/env node
// mergeRealM1History.js
// Usage: node scripts/mergeRealM1History.js
//
// Fusionne toutes les tranches M1 du broker (data/real-m1-history-v2/skip-N : fenetres de 8 jours, SANS les trous des exports v1) en UN fichier compresse par paire :
// data/real-m1-full/<PAIRE>.csv.gz  (colonnes time,open,high,low,close ; time = ms UTC REEL, comme l'export du broker - decaler de -5 h pour le moteur).
// Dedoublonne par `time`, trie, refuse les lignes invalides, et rapporte les trous (> 4 h hors week-end) pour ne pas les decouvrir plus tard.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SYMBOLS = (process.env.SYMBOLS || 'EURUSD,XAUUSD,US100,US500,GER40').split(',');
const SRC_ROOT = process.env.SRC_ROOT || 'data/real-m1-history-v2';
const OUT_DIR = process.env.OUT_DIR || 'data/real-m1-full';
const SRC = fs.readdirSync(SRC_ROOT).filter((d) => d.startsWith('skip-')).map((d) => path.join(SRC_ROOT, d));
fs.mkdirSync(OUT_DIR, { recursive: true });
const day = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const report = ['| Paire | Bougies | Début (UTC) | Fin (UTC) | Doublons retirés | Lignes invalides | Trous > 4 h hors week-end (fériés compris) |', '|---|---|---|---|---|---|---|'];
const gapsDetail = [];
for (const sym of SYMBOLS) {
  const m = new Map(); let raw = 0, bad = 0;
  for (const dir of SRC) {
    const f = path.join(dir, `${sym}.csv`);
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const p = line.split(',');
      const t = Number(p[0]);
      if (!Number.isFinite(t) || p.length < 5) { if (line && !line.startsWith('time')) bad++; continue; }
      const o = +p[1], h = +p[2], l = +p[3], c = +p[4];
      raw++;
      if (![o, h, l, c].every(Number.isFinite) || h < l || h < Math.max(o, c) - 1e-9 || l > Math.min(o, c) + 1e-9) { bad++; continue; }
      m.set(t, [o, h, l, c]);
    }
  }
  const times = [...m.keys()].sort((a, b) => a - b);
  let gaps = 0, suspect = 0;
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g <= 4 * 3600000) continue;
    const dow = new Date(times[i - 1]).getUTCDay();
    if (g < 72 * 3600000 && (dow === 5 || dow === 6 || dow === 0)) continue; // week-end normal
    if (g >= 30 * 3600000) suspect++; gaps++; gapsDetail.push(`${sym} ${day(times[i - 1])} -> ${day(times[i])} (${(g / 3600000).toFixed(1)} h)`);
  }
  const csv = ['time,open,high,low,close', ...times.map((t) => `${t},${m.get(t).join(',')}`)].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, `${sym}.csv.gz`), zlib.gzipSync(csv, { level: 6 }));
  report.push(`| ${sym} | ${times.length} | ${day(times[0])} | ${day(times[times.length - 1])} | ${raw - m.size - bad} | ${bad} | ${gaps} (dont ${suspect} de 30 h ou plus) |`);
}
const md = ['# Historique M1 du broker, fusionné', '', ...report, '', '## Trous', '', gapsDetail.length ? gapsDetail.map((g) => `- ${g}`).join('\n') : 'Aucun trou > 4 h hors week-end.', ''].join('\n');
fs.writeFileSync(path.join(OUT_DIR, 'README.md'), md);
console.log(md);
