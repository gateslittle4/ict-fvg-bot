// eyeRule.js - règles FVG M15 de la recherche de nuit (familles A et B) : opportunités (FVG qualifiés, voir fvgContext.js), filtres,
// exécution. Pur et testé (test/eyeRule.test.js). Même code pour l'exploration, la validation et le final.
import { qualifyingFvg, featuresAt, atrH1At } from './fvgContext.js';
import { simulate, nyMin, dayKey, MIN, HOUR } from './nightLab.js';

/**
 * Toutes les qualifications : à chaque clôture M15 j (marché ouvert juste après), pour chaque sens, le FVG qualifié le plus récent.
 * @returns {Array<{ j, tau, nm, dir, k, age, where, z }>} dans l'ordre du temps
 */
export function qualifications(X, { maxAge = 24 } = {}) {
  const { b15 } = X, out = [];
  for (let j = 2; j < b15.length - 1; j++) {
    const tau = b15[j].t + 15 * 60000;
    if (b15[j + 1].t - tau > 5 * 60000) continue;
    for (const dir of [1, -1]) {
      const q = qualifyingFvg(X, j, dir, b15[j].c);
      if (q && q.age <= maxAge) out.push({ j, tau, nm: nyMin(tau), dir, k: q.k, age: q.age, where: q.where, z: q.z });
    }
  }
  return out;
}

/** Première qualification de chaque FVG dans la fenêtre d'âge et d'heures (minutes NY [fromMin, toMin)). */
export function opportunities(quals, { ageMin = 5, ageMax = 24, fromMin = 180, toMin = 660 } = {}) {
  const seen = new Set(), out = [];
  for (const q of quals) {
    if (q.age < ageMin || q.age > ageMax || q.nm < fromMin || q.nm >= toMin) continue;
    const key = `${q.k}:${q.dir}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(q);
  }
  return out;
}

const featureCache = new WeakMap();
/** Caractéristiques (mémorisées) d'une opportunité. */
export function featuresOf(X, o) {
  let m = featureCache.get(X); if (!m) { m = new Map(); featureCache.set(X, m); }
  const key = `${o.j}:${o.dir}`;
  if (!m.has(key)) m.set(key, featuresAt(X, o.j, o.dir, { z: o.z, k: o.k, age: o.age, where: o.where }));
  return m.get(key);
}

/** Prochaine heure NY `min` (minutes) au plus tôt après t (même journée si possible). */
export function nextNyTime(t, min) {
  const now = nyMin(t);
  return t + ((min - now + 1440) % 1440 || 1440) * MIN - (t % MIN);
}

/**
 * Trades d'une règle. params : { filter(f, o) -> bool, entry: 'market'|'limit', stop: { type: 'atr'|'zone', k }, rr, exit: { type:
 * 'ny', min } | { type: 'hold', ms }, maxPerDay, spreadAt(price), swap }. Une position à la fois. Entrée au marché à la minute qui suit
 * la clôture de j ; ou ordre limite au bord proche de la zone (haut pour un achat), posé à la clôture de j et valable jusqu'à la sortie
 * au temps : les ordres limite posés pendant qu'on est à plat sont EN CONCURRENCE, le premier rempli gagne et les autres sont annulés
 * (ce qu'un bot ferait en direct ; corrigé le 2026-09-26 pendant l'exploration, avant toute lecture cachée — la version d'avant
 * prenait l'ordre du signal le plus ancien même s'il se remplissait après un ordre plus récent).
 */
export function ruleTrades(X, opps, params) {
  const { S, b15 } = X;
  const P = { entry: 'market', stop: { type: 'atr', k: 1 }, rr: 3, exit: { type: 'ny', min: 660 }, maxPerDay: 3, swap: () => 0, ...params };
  const out = []; let busy = -Infinity; const perDay = new Map();
  const prep = (o) => {
    const i = b15[o.j].i1 + 1; if (i >= S.n) return null;
    const dk = dayKey(o.tau); if ((perDay.get(dk) || 0) >= P.maxPerDay) return null;
    const f = featuresOf(X, o); if (!f) return null;
    if (P.filter && !P.filter(f, o)) return null;
    const atr = atrH1At(X, i);
    const exitAt = P.exit.type === 'ny' ? nextNyTime(o.tau, P.exit.min) : S.t[i] + P.exit.ms;
    const ref = P.entry === 'limit' ? (o.dir > 0 ? o.z.top : o.z.bot) : S.o[i];
    const sp = P.spreadAt(ref);
    const fill0 = P.entry === 'limit' ? ref : o.dir > 0 ? ref + sp : ref; // prix d'entrée prévu (pour placer le stop)
    let stop;
    if (P.stop.type === 'atr') stop = fill0 - o.dir * P.stop.k * atr;
    else { const far = o.dir > 0 ? o.z.bot : o.z.top; stop = far - o.dir * 0.1 * atr; if (Math.abs(fill0 - stop) < 0.3 * atr) stop = fill0 - o.dir * 0.3 * atr; }
    const spec = { dir: o.dir, i, stop, rr: P.rr, exitAt, spread: sp, swap: P.swap };
    if (P.entry === 'limit') Object.assign(spec, { entry: { type: 'limit', price: ref }, expiry: exitAt });
    return { spec, dk };
  };
  const take = (o, r, dk) => { out.push({ ...r, dir: o.dir, age: o.age, nm: o.nm, tau: o.tau }); perDay.set(dk, (perDay.get(dk) || 0) + 1); busy = r.exitTime + MIN; };
  for (let q = 0; q < opps.length; q++) {
    const o = opps[q];
    if (o.tau < busy) continue;
    const p = prep(o); if (!p) continue;
    if (P.entry !== 'limit') { const r = simulate(S, p.spec); if (!r.missed) take(o, r, p.dk); continue; }
    let best = simulate(S, p.spec), bo = o, bdk = p.dk;
    if (best.missed) best = null;
    for (let q2 = q + 1; q2 < opps.length; q2++) {
      const o2 = opps[q2];
      if (o2.tau >= p.spec.expiry || (best && o2.tau >= best.entryTime)) break;
      const p2 = prep(o2); if (!p2) continue;
      const r2 = simulate(S, p2.spec); if (r2.missed) continue;
      if (!best || r2.entryTime < best.entryTime) { best = r2; bo = o2; bdk = p2.dk; }
    }
    if (best) take(bo, best, bdk);
  }
  return out;
}

/**
 * Placebo d'une liste d'opportunités (amendement 1 du pré-enregistrement de nuit) : chacune déplacée de 1 à 6 bougies M15 au hasard
 * (même sens, même fenêtre d'heures [fromMin, toMin), marché ouvert juste après), zone fictive à la même distance du prix.
 * @param rnd () => [0, 1)
 */
export function placeboOpps(X, opps, { fromMin, toMin }, rnd) {
  const { b15 } = X, out = [];
  for (const o of opps) {
    for (let tries = 0; tries < 10; tries++) {
      const sh = (1 + Math.floor(rnd() * 6)) * (rnd() < 0.5 ? -1 : 1), j = o.j + sh;
      if (j < 30 || j >= b15.length - 1) continue;
      const tau = b15[j].t + 15 * MIN, nm = nyMin(tau);
      if (nm < fromMin || nm >= toMin || b15[j + 1].t - tau > 5 * MIN) continue;
      const d = b15[j].c - b15[o.j].c;
      out.push({ ...o, j, tau, nm, z: { ...o.z, top: o.z.top + d, bot: o.z.bot + d } });
      break;
    }
  }
  return out.sort((a, b) => a.tau - b.tau);
}
