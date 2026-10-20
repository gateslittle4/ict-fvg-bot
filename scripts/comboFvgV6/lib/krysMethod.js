// krysMethod.js - la méthode de Krystofia, première version (séance quiz, octobre 2026). Règles : docs/BRIEF-SEANCE-QUIZ.md.
// Bougies : { t (secondes UTC, ouverture), o, h, l, c }. Heure NY = UTC-5 fixe (comme le simulateur).
//
// FVG strict : 3 bougies contiguës, mèches comprises. Vente : c1.low > c3.high, zone [c3.high, c1.low]. Achat : c1.high < c3.low, zone [c1.high, c3.low].
// Règle c4 : la bougie suivante qui touche la zone devient le nouveau c3 (vente : son high devient le bas de la zone ; achat : son low devient le haut).
// Si elle traverse toute la zone, la zone est morte. Si elle reste entièrement dehors, la zone est validée et son bord proche est figé.
// La première touche après la validation est la bougie d'entrée (elle n'entre jamais dans le bord).
export const NY = 5 * 3600;
export const DEFAULTS = { maxAge: 8, hourFrom: 6, hourTo: 16, minRR: 3, stopMargin: 1, entryFraction: 0.5 };

export const nyHour = (t) => { const d = new Date((t - NY) * 1000); return d.getUTCHours() + d.getUTCMinutes() / 60; };

/** Parcourt les bougies et renvoie { zones, gaps } : zones = machine à états c4, gaps = FVG bruts (pour les cibles). */
export function buildZones(c, upto = c.length - 1) {
  const zones = [], gaps = [];
  for (let m = 0; m <= upto; m++) {
    const k = c[m];
    for (const z of zones) {
      if (z.dead != null || z.entered != null || z.created === m) continue;
      const touch = z.dir < 0 ? k.h >= z.lo : k.l <= z.hi;
      const eats = z.dir < 0 ? k.h >= z.hi : k.l <= z.lo;
      if (z.status === 'pending') {
        if (touch) { if (eats) z.dead = m; else if (z.dir < 0) z.lo = k.h; else z.hi = k.l; }
        else { z.status = 'valid'; z.vAt = m; }
      } else if (touch) { z.entered = m; if (eats) z.dead = m; }
    }
    if (m >= 2) {
      const a = c[m - 2];
      if (a.l > k.h) { zones.push({ dir: -1, lo: k.h, hi: a.l, lo0: k.h, hi0: a.l, created: m, status: 'pending' }); gaps.push({ dir: -1, lo: k.h, hi: a.l, created: m }); }
      else if (a.h < k.l) { zones.push({ dir: 1, lo: a.h, hi: k.l, lo0: a.h, hi0: k.l, created: m, status: 'pending' }); gaps.push({ dir: 1, lo: a.h, hi: k.l, created: m }); }
    }
  }
  return { zones, gaps };
}

/** Premier FVG du sens opposé encore non rempli (mèches comprises) dans le sens du TP, sans limite d'âge. */
export function targetFvg(c, gaps, upto, dir, from) {
  const cand = [];
  for (const g of gaps) {
    if (g.dir === dir || g.created > upto) continue;
    if (dir > 0 ? !(g.lo > from) : !(g.hi < from)) continue;
    let filled = false;
    for (let j = g.created + 1; j <= upto; j++) if (g.dir < 0 ? c[j].h >= g.hi : c[j].l <= g.lo) { filled = true; break; }
    if (!filled) cand.push(g);
  }
  cand.sort((a, b) => (dir > 0 ? a.lo - b.lo : b.hi - a.hi));
  return cand[0] || null;
}

/** Plan d'un ordre : entrée à 50 % de la zone restante, stop au bord lointain + marge, TP = le plus éloigné entre la moitié du FVG cible et minRR. */
export function plan(z, tg, o = DEFAULTS) {
  const near = z.dir < 0 ? z.lo : z.hi, far = z.dir < 0 ? z.hi : z.lo;
  const entry = near + (far - near) * o.entryFraction;
  const stop = z.dir < 0 ? far + o.stopMargin : far - o.stopMargin; // vente : bord haut + marge ; achat : bord bas - marge
  const risk = Math.abs(stop - entry);
  const half = z.dir > 0 ? tg.lo + (tg.hi - tg.lo) / 2 : tg.hi - (tg.hi - tg.lo) / 2;
  const tpMin = entry + z.dir * o.minRR * risk;
  const tp = z.dir > 0 ? Math.max(half, tpMin) : Math.min(half, tpMin);
  return { entry, stop, tp, risk, rr: Math.abs(tp - entry) / risk };
}

/** Décision à la fermeture de la bougie upto : liste de setups avec leurs raisons d'échec (fails vide = on prend). */
export function scan(c, upto = c.length - 1, opt = {}) {
  const o = { ...DEFAULTS, ...opt };
  const { zones, gaps } = buildZones(c, upto);
  const hr = nyHour(c[upto].t), inHour = hr >= o.hourFrom && hr < o.hourTo;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= upto; i++) { if (c[i].l < lo) lo = c[i].l; if (c[i].h > hi) hi = c[i].h; }
  const out = [];
  for (const z of zones) {
    if (z.status !== 'valid' || z.dead != null || z.entered != null) continue;
    const age = upto - z.created, fails = [];
    if (age > o.maxAge) fails.push('FVG d\'entrée trop vieux');
    if (!inHour) fails.push('hors plage horaire');
    const near = z.dir < 0 ? z.lo : z.hi;
    const tg = targetFvg(c, gaps, upto, z.dir, near);
    if (!tg) fails.push('pas de FVG cible');
    if (near >= hi - 1e-9 || near <= lo + 1e-9) fails.push('prix jamais tradé');
    const r = { dir: z.dir, zone: [z.lo, z.hi], age, fails };
    if (tg) { r.target = [tg.lo, tg.hi]; r.plan = plan(z, tg, o); }
    out.push(r);
  }
  return out;
}
