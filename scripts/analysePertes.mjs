// analysePertes.mjs - DESCRIPTIF (aucune règle, aucune décision) : que se passe-t-il dans les trades perdants réels de Krystofia (2025) ? Définitions figées dans docs/PREREG-ETUDE-PERTES-2025.md (écrit avant le calcul).
// Usage : node analysePertes.mjs <dossier data>   (lit real-trades-2025.csv et real-m1-full/US100.csv.gz)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseCsv, addR, monthOf } from './analyseMesTrades.mjs';

const NYF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const nyOffsetMs = (utcMs) => { const p = Object.fromEntries(NYF.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(utcMs / 60000) * 60000; };
/** 'YYYY-MM-DD HH:MM' (heure de New York, heure d'été comprise) -> ms UTC. */
export function nyToUtcMs(s) { const naive = Date.parse(s.replace(' ', 'T') + ':00Z'); let u = naive - nyOffsetMs(naive); u = naive - nyOffsetMs(u); return u; }
export const nyHourOf = (utcMs) => { const p = Object.fromEntries(NYF.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value])); return { h: +p.hour + +p.minute / 60, dow: new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay() }; };

export function loadM1(path, from, to) {
  const txt = zlib.gunzipSync(fs.readFileSync(path)).toString('latin1'), t = [], o = [], h = [], l = [], c = [];
  let pos = txt.indexOf('\n') + 1;
  while (pos > 0 && pos < txt.length) { let e = txt.indexOf('\n', pos); if (e < 0) e = txt.length; const p = txt.slice(pos, e).split(','); const ms = +p[0]; if (ms >= from && ms <= to && p.length >= 5) { t.push(ms); o.push(+p[1]); h.push(+p[2]); l.push(+p[3]); c.push(+p[4]); } pos = e + 1; }
  return { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c) };
}
export const lowerBound = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };

/** Chemin pendant le trade : E = ouverture de la barre M1 de la minute d'ouverture ; AFM = plus grand mouvement dans le sens du trade, en R. null si pas de barre à ±60 s. */
export function pathStats(M, openMs, closeMs, dir, R) {
  const i0 = lowerBound(M.t, openMs); if (i0 >= M.t.length || M.t[i0] - openMs > 60000) return null;
  const E = M.o[i0]; let best = 0;
  for (let i = i0; i < M.t.length && M.t[i] <= closeMs; i++) { const fav = dir > 0 ? M.h[i] - E : E - M.l[i]; if (fav > best) best = fav; }
  return { E, afm: best / R, i0 };
}
/** Après la sortie : dans les 4 h suivant la minute de clôture, le prix atteint-il E ? E + dir*3R ? Perte « propre » : s'éloigne d'au moins 2 R de plus (E - dir*3R) avant de revenir à E, ou ne revient jamais à E. */
export function afterStats(M, closeMs, dir, R, E, hours = 4) {
  const i1 = lowerBound(M.t, closeMs + 60000); let backE = false, tp3 = false, clean = null;
  for (let i = i1; i < M.t.length && M.t[i] <= closeMs + hours * 3600000; i++) {
    const hitE = dir > 0 ? M.h[i] >= E : M.l[i] <= E, hit3 = dir > 0 ? M.h[i] >= E + 3 * R : M.l[i] <= E - 3 * R, adv = dir > 0 ? M.l[i] <= E - 3 * R : M.h[i] >= E + 3 * R;
    if (hitE) backE = true; if (hit3) tp3 = true;
    if (clean === null) { if (hitE) clean = false; else if (adv) clean = true; }
  }
  return { backE, tp3, clean: clean === null ? true : clean };
}
/** Même mesure à partir d'un instant quelconque (base de comparaison) : atteint start + dir*R ? start + dir*4R ? dans les 4 h. */
export function randomStats(M, i, dir, R, hours = 4) {
  const P = M.o[i]; let r1 = false, r4 = false;
  for (let j = i + 1; j < M.t.length && M.t[j] <= M.t[i] + hours * 3600000; j++) { if (dir > 0 ? M.h[j] >= P + R : M.l[j] <= P - R) r1 = true; if (dir > 0 ? M.h[j] >= P + 4 * R : M.l[j] <= P - 4 * R) { r4 = true; break; } }
  return { r1, r4 };
}
export function wilson(k, n, z = 1.96) { if (!n) return [NaN, NaN]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - s) / d, (c + s) / d]; }
export function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Indices des barres M1 candidates (06:00-16:00 NY, lundi-vendredi) pour la base de comparaison. */
export function sessionBars(M) { const out = []; for (let i = 0; i < M.t.length; i++) { const { h, dow } = nyHourOf(M.t[i]); if (dow >= 1 && dow <= 5 && h >= 6 && h < 16) out.push(i); } return out; }

const csvRaw = (txt) => { const L = txt.replace(/^﻿/, '').trim().split(/\r?\n/), H = L[0].split(','); return L.slice(1).map((l) => { const p = l.split(','), o = {}; H.forEach((h, i) => (o[h] = p[i])); return o; }); };
const pct = (k, n) => `${(100 * k / n).toFixed(0)} %`.padStart(5);
const ci = (k, n) => { const [a, b] = wilson(k, n); return `[${(100 * a).toFixed(0)} ; ${(100 * b).toFixed(0)}]`; };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

if (process.argv[1].endsWith('analysePertes.mjs')) {
  const D = process.argv[2], raw = csvRaw(fs.readFileSync(`${D}/real-trades-2025.csv`, 'utf8')), T = parseCsv(fs.readFileSync(`${D}/real-trades-2025.csv`, 'utf8'));
  T.forEach((t, i) => { const r = raw[i]; t.dir = r.side === 'Buy' ? 1 : -1; t.p0 = +r.open_price; t.p1 = +r.close_price; t.R_pts = Math.abs(t.p1 - t.p0); t.uOpen = nyToUtcMs(t.open); t.uClose = nyToUtcMs(t.close); });
  const Rm = addR(T), L = T.filter((t) => t.usd < 0), W = T.filter((t) => t.usd > 0), totLoss = -L.reduce((a, t) => a + t.usd, 0);
  console.log(`CONTRÔLE : ${T.length} trades, ${L.length} pertes, ${W.length} gains, ${T.length - L.length - W.length} nuls | perte totale $ ${totLoss.toFixed(0)} | gain total $ ${W.reduce((a, t) => a + t.usd, 0).toFixed(0)} | résultat $ ${T.reduce((a, t) => a + t.usd, 0).toFixed(0)}`);
  // 1) taille des pertes
  const sz = (t) => -t.R; // perte en multiples de la perte médiane du mois
  console.log('\n== 1) Taille des pertes (en multiples de la perte médiane du mois)');
  console.log('perte médiane $', med(L.map((t) => -t.usd)).toFixed(0), '| médiane des multiples', med(L.map(sz)).toFixed(2), '| plus grosse', Math.max(...L.map(sz)).toFixed(2), '| plus grosse en $', Math.max(...L.map((t) => -t.usd)).toFixed(0));
  for (const [lab, th] of [['>= 1,5 x', 1.5], ['>= 2 x', 2]]) { const g = L.filter((t) => sz(t) >= th), s = -g.reduce((a, t) => a + t.usd, 0); console.log(lab.padEnd(8), 'n', String(g.length).padStart(3), `(${pct(g.length, L.length)} des pertes)`, '| $', s.toFixed(0).padStart(6), `(${pct(s, totLoss)} de la perte totale)`); }
  for (const m of Object.keys(Rm).sort()) { const g = L.filter((t) => monthOf(t) === m), big = g.filter((t) => sz(t) >= 1.5); console.log(' ', m, 'pertes', String(g.length).padStart(3), '| >=1,5x :', String(big.length).padStart(3), '| $ des grosses', (-big.reduce((a, t) => a + t.usd, 0)).toFixed(0).padStart(5), 'sur', (-g.reduce((a, t) => a + t.usd, 0)).toFixed(0)); }
  // 1bis) AJOUTÉ APRÈS COUP (pas dans le pré-enregistrement) : les grosses pertes viennent-elles d'un volume plus gros ou d'un stop plus large ?
  console.log('\n== 1bis) AJOUT APRÈS COUP : grosses pertes (>= 1,5 x) = volume plus gros ou stop plus large ? (par mois : médiane du volume et du R en points, pertes normales contre grosses)');
  let bigVol = 0, bigPts = 0, bigBoth = 0, bigNone = 0;
  for (const m of Object.keys(Rm).sort()) {
    const g = L.filter((t) => monthOf(t) === m), mv = med(g.map((t) => t.vol)), mp = med(g.map((t) => t.R_pts)), big = g.filter((t) => sz(t) >= 1.5), norm = g.filter((t) => sz(t) < 1.5);
    for (const t of big) { const v = t.vol >= 1.3 * mv, q = t.R_pts >= 1.3 * mp; if (v && q) bigBoth++; else if (v) bigVol++; else if (q) bigPts++; else bigNone++; }
    console.log(' ', m, `volume médian ${mv.toFixed(2)} | normales : vol ${med(norm.map((t) => t.vol)).toFixed(2)}, stop ${med(norm.map((t) => t.R_pts)).toFixed(1)} pts | grosses : vol ${med(big.map((t) => t.vol)).toFixed(2)}, stop ${med(big.map((t) => t.R_pts)).toFixed(1)} pts`);
  }
  console.log(`Grosses pertes (n ${bigVol + bigPts + bigBoth + bigNone}) : volume >= 1,3 x le médian du mois seulement ${bigVol} | stop >= 1,3 x le médian seulement ${bigPts} | les deux ${bigBoth} | aucun des deux ${bigNone}`);
  // 1ter) AJOUTÉ APRÈS COUP : arithmétique pure, borne optimiste (suppose que les gains n'auraient pas changé)
  { const cap = (th) => L.reduce((a, t) => a + Math.max(0, -t.usd - th * (-t.usd / sz(t))), 0), res = T.reduce((a, t) => a + t.usd, 0);
    console.log(`\n== 1ter) AJOUT APRÈS COUP : si aucune perte n'avait dépassé 1,5 x (ou 2 x) la perte médiane de son mois : économie $ ${cap(1.5).toFixed(0)} (ou ${cap(2).toFixed(0)}) -> résultat $ ${res.toFixed(0)} deviendrait ${(res + cap(1.5)).toFixed(0)} (ou ${(res + cap(2)).toFixed(0)}) ; hors avril : ${(res - T.filter((t) => monthOf(t) === '2025-04').reduce((a, t) => a + t.usd, 0) + L.filter((t) => monthOf(t) !== '2025-04').reduce((a, t) => a + Math.max(0, -t.usd - 1.5 * (-t.usd / sz(t))), 0)).toFixed(0)} (1,5 x)`); }
  // 2) chemin pendant le trade + 3) après la perte
  const M = loadM1(`${D}/real-m1-full/US100.csv.gz`, Date.UTC(2025, 1, 1), Date.UTC(2025, 8, 1));
  console.log('\nbarres M1 chargées :', M.t.length);
  let nom = 0; for (const t of L) { const p = pathStats(M, t.uOpen, t.uClose, t.dir, t.R_pts); if (!p || !(t.R_pts > 0)) { nom++; t.path = null; continue; } t.path = p; t.after = afterStats(M, t.uClose, t.dir, t.R_pts, p.E); }
  const ok = L.filter((t) => t.path); console.log('pertes mesurables :', ok.length, '(sans barre ou R nul :', nom, ')');
  const cats = [['moins de 0,25 R (jamais parti dans ton sens)', (a) => a < 0.25], ['0,25 à 1 R', (a) => a >= 0.25 && a < 1], ['1 R ou plus (parti puis revenu au stop)', (a) => a >= 1]];
  console.log('\n== 2) Avancée favorable maximale (AFM) avant la perte');
  console.log('R du trade (points) : médiane', med(ok.map((t) => t.R_pts)).toFixed(1), '| AFM médiane', med(ok.map((t) => t.path.afm)).toFixed(2));
  for (const [lab, f] of cats) { const g = ok.filter((t) => f(t.path.afm)), s = -g.reduce((a, t) => a + t.usd, 0); console.log(lab.padEnd(46), 'n', String(g.length).padStart(3), `(${pct(g.length, ok.length)})`, '| $', s.toFixed(0).padStart(6), `(${pct(s, -ok.reduce((a, t) => a + t.usd, 0))} des pertes mesurées)`, '| durée médiane min', med(g.map((t) => (t.uClose - t.uOpen) / 60000)).toFixed(0)); }
  // base de comparaison
  const bars = sessionBars(M), r = rng(20261006), base = { n: 0, r1: 0, r4: 0 };
  for (const t of ok) for (let q = 0; q < 20; q++) { const i = bars[(r() * bars.length) | 0], s = randomStats(M, i, t.dir, t.R_pts); base.n++; if (s.r1) base.r1++; if (s.r4) base.r4++; }
  console.log('\n== 3) Après la perte (4 h suivantes)');
  const rows = [['TOUTES les pertes mesurables', ok]].concat(cats.map(([lab, f]) => [lab, ok.filter((t) => f(t.path.afm))]));
  console.log('Part des pertes où le prix revient au niveau d\'entrée E / atteint E + 3 R / perte « propre » ; IC 95 % de Wilson');
  for (const [lab, g] of rows) { const n = g.length, e = g.filter((t) => t.after.backE).length, x = g.filter((t) => t.after.tp3).length, cl = g.filter((t) => t.after.clean).length; console.log(lab.padEnd(46), 'n', String(n).padStart(3), '| retour à E', pct(e, n), ci(e, n), '| atteint 3 R', pct(x, n), ci(x, n), '| propre', pct(cl, n), ci(cl, n)); }
  console.log(`BASE DE COMPARAISON (${base.n} instants tirés au hasard, 06-16 NY, mêmes sens et R) : atteint +1 R en 4 h : ${pct(base.r1, base.n)} | atteint +4 R en 4 h : ${pct(base.r4, base.n)}`);
  // sensibilité (ajoutée après coup au pré-enregistrement) : mêmes mesures depuis le prix de la barre M1 de clôture
  let s1 = 0, s4 = 0; for (const t of ok) { const i = lowerBound(M.t, t.uClose); if (i >= M.t.length) continue; const P = M.c[i], j0 = lowerBound(M.t, t.uClose + 60000); let a = false, b = false; for (let j = j0; j < M.t.length && M.t[j] <= t.uClose + 4 * 3600000; j++) { if (t.dir > 0 ? M.h[j] >= P + t.R_pts : M.l[j] <= P - t.R_pts) a = true; if (t.dir > 0 ? M.h[j] >= P + 4 * t.R_pts : M.l[j] <= P - 4 * t.R_pts) b = true; } if (a) s1++; if (b) s4++; }
  console.log(`SENSIBILITÉ (ajoutée après coup ; depuis le prix M1 de la minute de clôture, comme la base) : atteint +1 R ${pct(s1, ok.length)} ${ci(s1, ok.length)} | atteint +4 R ${pct(s4, ok.length)} ${ci(s4, ok.length)}`);
}
