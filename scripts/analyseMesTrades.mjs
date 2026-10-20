// analyseMesTrades.mjs - DESCRIPTIF (aucune règle, aucune décision) : qu'est-ce que Krystofia faisait le mieux dans ses 646 trades de 2025 ?
// Données : data/real-trades-2025.csv (historique de sa plateforme, heures de New York). R = perte médiane du mois (comme dans le brief du projet) ; tout est en échantillon.
// Usage : node analyseMesTrades.mjs <real-trades-2025.csv>
import fs from 'node:fs';

export function parseCsv(txt) {
  const L = txt.replace(/^﻿/, '').trim().split(/\r?\n/), H = L[0].split(',');
  return L.slice(1).map((l) => { const p = l.split(','), o = {}; H.forEach((h, i) => (o[h] = p[i])); return { open: o.open_time_ny, close: o.close_time_ny, side: o.side, vol: +o.volume, usd: +o.profit_usd }; });
}
const ms = (s) => Date.parse(s.replace(' ', 'T') + ':00Z');
export const durMin = (t) => (ms(t.close) - ms(t.open)) / 60000;
export const hourOf = (t) => +t.open.slice(11, 13);
export const dowOf = (t) => new Date(ms(t.open)).getUTCDay();
export const monthOf = (t) => t.open.slice(0, 7);
export const dayOf = (t) => t.open.slice(0, 10);
/** R déjà réalisé dans la journée avant l'ouverture de chaque trade (trades du même jour déjà clôturés), et écart en minutes avec l'ouverture du trade précédent du jour. Ajoute t.dayR et t.gap (null = 1er trade). */
export function addDayContext(T) {
  for (const t of T) { t.dayR = T.filter((u) => dayOf(u) === dayOf(t) && ms(u.close) <= ms(t.open) && u !== t).reduce((a, u) => a + u.R, 0); const prev = T.filter((u) => dayOf(u) === dayOf(t) && ms(u.open) < ms(t.open)).map((u) => ms(u.open)); t.gap = prev.length ? (ms(t.open) - Math.max(...prev)) / 60000 : null; }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** R par mois = perte médiane (en valeur absolue) des trades perdants du mois. Ajoute t.R. */
export function addR(T) {
  const by = {}; for (const t of T) if (t.usd < 0) (by[monthOf(t)] ||= []).push(-t.usd);
  const R = Object.fromEntries(Object.entries(by).map(([m, a]) => [m, med(a)]));
  for (const t of T) t.R = t.usd / R[monthOf(t)];
  return R;
}
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** IC 95 % bootstrap de la moyenne (2000 tirages, graine fixe). */
export function bootCI(x, B = 2000) { if (x.length < 5) return [NaN, NaN]; const r = rng(7), m = []; for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < x.length; i++) s += x[(r() * x.length) | 0]; m.push(s / x.length); } m.sort((a, b) => a - b); return [m[Math.floor(0.025 * B)], m[Math.floor(0.975 * B)]]; }

/** Résumé d'un groupe de trades : n, gagnants, R moyen, R total, $ total, IC95 du R moyen. */
export function summ(g) { const R = g.map((t) => t.R), ci = bootCI(R); return { n: g.length, win: g.length ? g.filter((t) => t.usd > 0).length / g.length : 0, mean: avg(R), totR: R.reduce((a, b) => a + b, 0), usd: g.reduce((a, t) => a + t.usd, 0), lo: ci[0], hi: ci[1] }; }

if (process.argv[1].endsWith('analyseMesTrades.mjs')) {
  const T = parseCsv(fs.readFileSync(process.argv[2], 'utf8')), Rm = addR(T), f2 = (x) => x.toFixed(2).padStart(6), f0 = (x) => x.toFixed(0).padStart(6);
  const line = (nm, g) => { const s = summ(g); console.log(nm.padEnd(26), String(s.n).padStart(4), `${(100 * s.win).toFixed(0).padStart(3)} %`, 'R moy', f2(s.mean), `[${f2(s.lo)} ; ${f2(s.hi)}]`, 'R tot', f2(s.totR).padStart(7), '$', f0(s.usd), s.lo > 0 ? ' <- IC > 0' : s.hi < 0 ? ' <- IC < 0' : ''); };
  const group = (title, fn, order) => { console.log('\n== ' + title); const m = new Map(); for (const t of T) { const k = fn(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t); } for (const k of (order || [...m.keys()].sort())) if (m.has(k)) line(String(k), m.get(k)); };
  console.log('CONTRÔLE : n', T.length, '| $ total', T.reduce((a, t) => a + t.usd, 0).toFixed(0), '| gagnants', (100 * T.filter((t) => t.usd > 0).length / T.length).toFixed(1) + ' %', '| gain moyen $', avg(T.filter((t) => t.usd > 0).map((t) => t.usd)).toFixed(0), '| perte moyenne $', avg(T.filter((t) => t.usd < 0).map((t) => t.usd)).toFixed(0));
  console.log('R du mois ($) :', Object.entries(Rm).map(([m, v]) => `${m} ${v.toFixed(0)}`).join(' | '));
  line('TOUS', T);
  const mois = (t) => monthOf(t); line('SANS AVRIL', T.filter((t) => mois(t) !== '2025-04'));
  const top = [...T].sort((a, b) => b.R - a.R).slice(0, 10); line('SANS LES 10 PLUS GROS GAINS', T.filter((t) => !top.includes(t)));
  group('Par mois', monthOf);
  group('Par sens', (t) => t.side);
  group('Par heure d\'ouverture (NY)', (t) => { const h = hourOf(t); return h < 6 ? '00-06' : h < 8 ? '06-08' : h < 10 ? '08-10' : h < 12 ? '10-12' : h < 16 ? '12-16' : '16+'; }, ['00-06', '06-08', '08-10', '10-12', '12-16', '16+']);
  group('Par jour de semaine', (t) => ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dowOf(t)], ['lun', 'mar', 'mer', 'jeu', 'ven']);
  group('Par durée du trade', (t) => { const d = durMin(t); return d <= 5 ? '1) <= 5 min' : d <= 30 ? '2) 5-30 min' : d <= 60 ? '3) 30-60 min' : d <= 240 ? '4) 1-4 h' : '5) > 4 h'; });
  const rank = {}; for (const t of T) { const d = dayOf(t); rank[d] = (rank[d] || 0) + 1; t.rank = rank[d]; }
  group('Rang du trade dans la journée', (t) => (t.rank === 1 ? '1) 1er' : t.rank === 2 ? '2) 2e' : t.rank <= 4 ? '3) 3e-4e' : t.rank <= 8 ? '4) 5e-8e' : '5) 9e+'));
  addDayContext(T);
  group('R déjà réalisé dans la journée avant le trade', (t) => (t.dayR >= 0 ? '1) >= 0' : t.dayR > -2 ? '2) 0 a -2' : t.dayR > -4 ? '3) -2 a -4' : '4) moins de -4'));
  group('Écart avec l\'ouverture du trade précédent', (t) => (t.gap === null ? '1) 1er du jour' : t.gap < 5 ? '2) < 5 min' : t.gap < 30 ? '3) 5-30 min' : t.gap < 120 ? '4) 30-120 min' : '5) > 2 h'));
  const perDay = {}; for (const t of T) perDay[dayOf(t)] = (perDay[dayOf(t)] || 0) + 1;
  group('Jours selon le nombre de trades', (t) => { const n = perDay[dayOf(t)]; return n <= 3 ? '1) jour <= 3 trades' : n <= 6 ? '2) jour 4-6' : n <= 10 ? '3) jour 7-10' : '4) jour 11+'; });
  console.log('\nJours :', Object.keys(perDay).length, '| trades par jour : médiane', med(Object.values(perDay)), 'max', Math.max(...Object.values(perDay)));
}
