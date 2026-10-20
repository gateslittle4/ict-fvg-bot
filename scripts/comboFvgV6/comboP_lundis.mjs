// comboP_lundis.mjs - DESCRIPTIF (aucune décision, aucun filtre, aucun R) : les lundis que F2 saute, et si le prix est revenu.
// Définitions écrites AVANT le calcul (2026-10-06 ≈ 21:15 UTC) :
//  - jour = date de New York ; session = bougies M15 de 06:00 à 16:00 NY (au moins 30 bougies pour compter).
//  - vendredi haussier = clôture de session > ouverture ET clôture dans le tiers haut de la plage de la session.
//  - ordre posé = F2 a posé au moins un ordre d'achat ce jour-là (rempli ou non).
//  - sauté faute de cible = aucun ordre posé ET au moins une zone d'achat valide (balayage H4 ok, âge ≤ 8, dans les heures) sans FVG de vente à viser.
//  - sauté pour une autre raison = aucun ordre posé et aucune zone de ce type.
//  - « prix revenu » (lundi) = plus bas de la session du lundi ≤ clôture du vendredi (revenu à la clôture du vendredi) ; et ≤ plus haut de la session du vendredi (a retesté ce plus haut).
//  - AJOUT après lecture du 1er résultat (descriptif, signalé comme tel) : « zone d'achat sans cible » sans exiger le balayage H4 (noTargetAny), car la règle de Krystofia ne parle pas du balayage.
//  - comparaison : lundis après vendredi haussier, lundis après autre vendredi, et mardi-vendredi.
// Usage : node comboP_lundis.mjs <dossier data>
import { loadAll, RULES } from './comboF.mjs';
import { backtest } from './lib/krysBacktestW.js';
import { h4SweepFilter } from './lib/krysBacktest.js';

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };
export const nyDate = (t) => new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10);
const nyHourOf = (t) => { const d = new Date((t - 5 * 3600) * 1000); return d.getUTCHours() + d.getUTCMinutes() / 60; };
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const dowOf = (d) => new Date(d + 'T00:00:00Z').getUTCDay();

/** Agrégat de la session 06–16 NY par date : { open, close, high, low, n, first } (first = indice de la première bougie). */
export function sessions(c) {
  const S = new Map();
  for (let i = 0; i < c.length; i++) {
    const h = nyHourOf(c[i].t); if (h < 6 || h >= 16) continue;
    const d = nyDate(c[i].t), x = S.get(d);
    if (!x) S.set(d, { open: c[i].o, close: c[i].c, high: c[i].h, low: c[i].l, n: 1, first: i });
    else { x.close = c[i].c; if (c[i].h > x.high) x.high = c[i].h; if (c[i].l < x.low) x.low = c[i].l; x.n++; }
  }
  return S;
}
export const bullish = (s) => !!s && s.n >= 30 && s.close > s.open && s.high > s.low && (s.close - s.low) / (s.high - s.low) >= 2 / 3;

/** Un an : pour chaque jour de l'année, ordres posés, zones sans cible. Renvoie des lignes { date, dow, orders, noTarget, s, prev (session du jour de référence), ... }. */
export function runYearDays(all, Y) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const orders = new Map(), noT = new Map(), noAny = new Map(), sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction,
    onOrder: ({ m, dir }) => { if (dir > 0) { const d = nyDate(c[m].t); orders.set(d, (orders.get(d) || 0) + 1); } },
    onNoTarget: ({ z, m }) => { if (z.dir > 0) { const d0 = nyDate(c[m].t); if (!noAny.has(d0)) noAny.set(d0, new Set()); noAny.get(d0).add(z.created); } if (z.dir > 0 && sw({ z })) { const d = nyDate(c[m].t); if (!noT.has(d)) noT.set(d, new Set()); noT.get(d).add(z.created); } } };
  backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) });
  const S = sessions(c), rows = [];
  for (const [date, s] of S) {
    if (s.first < start || s.n < 30 || !date.startsWith(String(Y))) continue;
    const dow = dowOf(date); if (dow === 0 || dow === 6) continue;
    const prevDate = dow === 1 ? addDays(date, -3) : addDays(date, -1), prev = S.get(prevDate);
    rows.push({ date, dow, s, prev: prev && prev.n >= 30 ? prev : null, orders: orders.get(date) || 0, noTarget: noT.has(date) ? noT.get(date).size : 0, noTargetAny: noAny.has(date) ? noAny.get(date).size : 0 });
  }
  return rows;
}

export const status = (r) => (r.orders > 0 ? 'ordre' : r.noTarget > 0 ? 'sans cible' : 'autre');

if (process.argv[1].endsWith('comboP_lundis.mjs')) {
  const all = loadAll(), rows = [];
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearDays(all, Y); if (r) rows.push(...r); }
  const pct = (a, n) => (n ? (100 * a / n).toFixed(0) : '0').padStart(3) + ' %';
  const groups = { 'Lundis après vendredi haussier': rows.filter((r) => r.dow === 1 && r.prev && bullish(r.prev)), 'Lundis après autre vendredi': rows.filter((r) => r.dow === 1 && r.prev && !bullish(r.prev)), 'Mardi à vendredi (tous)': rows.filter((r) => r.dow >= 2 && r.prev) };
  console.log(`Jours analysés : ${rows.length} (2011 → 21/09/2026)\n`);
  console.log('Groupe'.padEnd(34), 'jours', '| ordre posé | sauté faute de cible | sauté autre raison');
  for (const [nm, g] of Object.entries(groups)) { const a = g.filter((r) => status(r) === 'ordre').length, b = g.filter((r) => status(r) === 'sans cible').length, d = g.filter((r) => status(r) === 'autre').length; console.log(nm.padEnd(34), String(g.length).padStart(5), '|', `${a} (${pct(a, g.length)})`.padEnd(11), '|', `${b} (${pct(b, g.length)})`.padEnd(20), '|', `${d} (${pct(d, g.length)})`); }
  console.log('\nLundis : le prix est-il revenu ? (plus bas de la session du lundi ≤ clôture du vendredi / ≤ plus haut de session du vendredi)');
  console.log('Sous-groupe'.padEnd(52), 'jours', '| revenu à la clôture ven. | a retesté le plus haut ven. | lundi clôture > ouverture');
  const lm = (nm, g) => { if (!g.length) return; const rc = g.filter((r) => r.s.low <= r.prev.close).length, rh = g.filter((r) => r.s.low <= r.prev.high).length, up = g.filter((r) => r.s.close > r.s.open).length; console.log(nm.padEnd(52), String(g.length).padStart(5), '|', pct(rc, g.length).padEnd(24), '|', pct(rh, g.length).padEnd(27), '|', pct(up, g.length)); };
  const BF = groups['Lundis après vendredi haussier'], OT = groups['Lundis après autre vendredi'];
  lm('Après ven. haussier : tous', BF);
  lm('  dont ordre posé', BF.filter((r) => status(r) === 'ordre'));
  lm('  dont sauté faute de cible', BF.filter((r) => status(r) === 'sans cible'));
  lm('  dont sauté autre raison', BF.filter((r) => status(r) === 'autre'));
  lm('Après autre vendredi : tous', OT);
  lm('  dont sauté faute de cible', OT.filter((r) => status(r) === 'sans cible'));
  console.log('\n[AJOUT après le 1er résultat] Jours avec au moins une zone d\'achat valide SANS cible (balayage H4 non exigé) :');
  for (const [nm, g] of Object.entries(groups)) { const a = g.filter((r) => r.noTargetAny > 0).length, b = g.filter((r) => r.noTargetAny > 0 && r.orders === 0).length; console.log(nm.padEnd(34), String(g.length).padStart(5), '|', `${a} (${pct(a, g.length)})`.padEnd(12), '| dont aucun ordre posé :', `${b} (${pct(b, g.length)})`); }
  const BN = BF.filter((r) => r.noTargetAny > 0 && r.orders === 0); lm('Lundis après ven. haussier, zone sans cible et aucun ordre', BN);
  console.log('\nPar période (lundis après vendredi haussier, sautés faute de cible / total) :');
  for (const [a, b] of [[2011, 2016], [2017, 2022], [2023, 2025], [2026, 2026]]) { const g = BF.filter((r) => +r.date.slice(0, 4) >= a && +r.date.slice(0, 4) <= b); console.log(`${a}-${b}`.padEnd(10), `${g.filter((r) => status(r) === 'sans cible').length} / ${g.length}`); }
}
