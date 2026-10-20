// comboU_aveugle.mjs - tirage de signaux de F2 pour le tri à l'aveugle de Krystofia. Protocole figé : docs/PREREG-TRI-A-L-AVEUGLE-F2.md (écrit avant le tirage).
// Usage : node comboU_aveugle.mjs <dossier data> <graine> <nombre> <sortie signaux.json> <sortie cle.json> [cle.json à exclure, séparés par des virgules]
// signaux.json : ce qui est montré (prix relatifs à l'entrée, heures NY, aucune date, aucun résultat). cle.json : résultat de chaque signal (à ne pas ouvrir avant les réponses).
import fs from 'node:fs';
import { loadAll } from './comboF.mjs';
import { runYearTRaw } from './comboT.mjs';
import { rng } from './comboS_pertes.mjs';
import { nyHour } from './lib/krysMethod.js';

const nyDate = (t) => new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10);
const hhmm = (t) => { const h = nyHour(t), H = Math.floor(h), M = Math.round((h - H) * 60); return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`; };

/** Tire n trades de F2C (placedIdx >= 400), un par jour calendaire, avec la graine donnée. */
export function sample(pop, n, seed) {
  const r = rng(seed), idx = pop.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const out = [], days = new Set();
  for (const i of idx) { const d = pop[i].day; if (days.has(d)) continue; days.add(d); out.push(pop[i]); if (out.length === n) break; }
  return out;
}
/** Données du graphique : 160 bougies M15 jusqu'à la pose incluse, prix relatifs à l'entrée ; 40 bougies H4 complètes. Rien d'après la pose. */
export function chartData(c, t) {
  const m = t.placedIdx, E = t.entry, rel = (x) => +(x - E).toFixed(2), a = m - 159;
  const m15 = []; for (let i = a; i <= m; i++) m15.push({ o: rel(c[i].o), h: rel(c[i].h), l: rel(c[i].l), c: rel(c[i].c), hh: hhmm(c[i].t), newDay: i > a && Math.floor((c[i].t - 5 * 3600) / 86400) !== Math.floor((c[i - 1].t - 5 * 3600) / 86400) });
  const key = (x) => Math.floor((x.t - 5 * 3600) / 14400), curKey = key(c[m]), H = []; let cur = null;
  for (let i = Math.max(0, m - 1200); i <= m; i++) { const k = key(c[i]); if (!cur || cur.key !== k) { if (cur) H.push(cur); cur = { key: k, o: c[i].o, h: c[i].h, l: c[i].l, c: c[i].c, hh: hhmm(c[i].t) }; } else { cur.h = Math.max(cur.h, c[i].h); cur.l = Math.min(cur.l, c[i].l); cur.c = c[i].c; } }
  const done = H.filter((x) => x.key < curKey).slice(-40), low6 = Math.min(...done.slice(-6).map((x) => x.l));
  return { m15, h4: done.map((x) => ({ o: rel(x.o), h: rel(x.h), l: rel(x.l), c: rel(x.c), hh: x.hh })), h4Low6: rel(low6), entry: 0, stop: rel(t.stop), tp: rel(t.tp), zone: [rel(t.zoneNow[0]), rel(t.zoneNow[1])], zoneStart: t.zCreated - a, target: t.targetCreated ? [rel(t.target[0]), rel(t.target[1])] : null, targetStart: t.targetCreated ? Math.max(0, t.targetCreated - a) : null, placedHour: hhmm(c[m].t), riskPts: +(t.risk).toFixed(1) };
}

if (process.argv[1].endsWith('comboU_aveugle.mjs')) {
  const [, , D, seedS, nS, outSig, outKey, excl] = process.argv, exclude = new Set((excl ? excl.split(',') : []).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).map((x) => x.key))), all = loadAll(), pop = [], store = new Map();
  for (let Y = 2011; Y <= 2022; Y++) { const run = runYearTRaw(all, Y, {}); if (!run) continue; store.set(Y, run.c); for (const t of run.T) if (t.placedIdx >= 400 && !exclude.has(`${Y}:${t.placedIdx}`)) pop.push({ ...t, Y, day: nyDate(run.c[t.placedIdx].t) }); }
  const picked = sample(pop, +nS, +seedS), sig = [], key = [];
  picked.forEach((t, i) => { const c = store.get(t.Y); sig.push({ id: i + 1, ...chartData(c, t) }); key.push({ id: i + 1, date: t.day, year: t.Y, r: t.r, why: t.why, key: `${t.Y}:${t.placedIdx}`, durBars: t.exitIdx - t.fillIdx }); });
  fs.writeFileSync(outSig, JSON.stringify(sig)); fs.writeFileSync(outKey, JSON.stringify(key, null, 1));
  console.log('population', pop.length, '| tirés', picked.length, '| fichiers écrits (résultats non affichés)');
}
