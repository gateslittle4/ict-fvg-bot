// krysBacktestW.js - COPIE de krysBacktest.js avec trois ajouts : tpMode 'far' (bord lointain du FVG cible), l'option stopMult et l'option maxTargetAgeDays (âge maximal de la cible, en jours) deux rappels d'observation onNoTarget / onOrder (comptage, sans effet sur les trades) et l'option noTargetRR (RR visé quand il n'y a aucune cible) (stop = entrée - stopMult x risque0 ; le TP reste celui du risque0 d'origine). Sans l'option : identique à krysBacktest.js.
// krysBacktest.js - backtest pas à pas de la méthode de Krystofia (v1), en une seule passe sur les bougies M15.
// Ordres limites à 50 % de la zone restante du FVG strict validé ; un ordre par FVG ; une position à la fois ; annulation à la fin de la plage horaire,
// si la zone meurt, si le stop ou le TP est touché avant le remplissage. Conventions pessimistes : si le stop et le TP sont touchés dans la même
// bougie, le stop gagne ; le stop compte même dans la bougie de remplissage ; spread payé à l'entrée des achats et à la sortie des ventes.
import { DEFAULTS, nyHour } from './krysMethod.js';

export function backtest(c, opt = {}) {
  const o = { ...DEFAULTS, spread: 0.6, maxHold: 96, start: 0, tpMode: 'half', maxRR: 0, ...opt }; // tpMode : 'half' (moitié du FVG cible ou 3R), 'near' (bord proche du FVG cible ou 3R), '3r'
  const zones = [], gaps = [], orders = [], trades = [];
  let pos = null, hi = -Infinity, lo = Infinity;
  for (let m = 0; m < c.length; m++) {
    const k = c[m], hr = nyHour(k.t);
    // 1) position ouverte : sorties (à partir de la bougie du remplissage, stop d'abord)
    if (pos) {
      const buy = pos.dir > 0, sp = o.spread;
      const stopHit = buy ? k.l <= pos.stop : k.h + sp >= pos.stop;
      const tpHit = m > pos.fillIdx && (buy ? k.h >= pos.tp : k.l + sp <= pos.tp);
      let exit = null, why = null;
      if (stopHit) { exit = pos.stop; why = 'stop'; } else if (tpHit) { exit = pos.tp; why = 'tp'; }
      else if (m - pos.fillIdx >= o.maxHold) { exit = buy ? k.c : k.c + sp; why = 'temps'; }
      if (exit !== null) { trades.push({ ...pos, exitIdx: m, exit, why, r: (buy ? exit - pos.entry : pos.entry - exit) / pos.risk }); pos = null; }
    }
    // 2) ordres en attente : remplissage ou annulation
    for (let q = orders.length - 1; q >= 0; q--) {
      const od = orders[q], buy = od.dir > 0, z = od.z;
      if (od.placedIdx === m) continue;
      const fillHit = buy ? k.l + o.spread <= od.entry : k.h >= od.entry;
      const killed = z.dead != null && z.dead <= m || (buy ? k.l <= od.stop : k.h >= od.stop) || (buy ? k.h >= od.tp : k.l <= od.tp) || hr >= o.hourTo || hr < o.hourFrom;
      if (fillHit && !pos) { orders.splice(q, 1); pos = { ...od, fillIdx: m }; delete pos.z; const stopHit = buy ? k.l <= pos.stop : k.h + o.spread >= pos.stop; if (stopHit) { trades.push({ ...pos, exitIdx: m, exit: pos.stop, why: 'stop', r: -1 }); pos = null; } continue; }
      if (fillHit && pos) { orders.splice(q, 1); continue; } // déjà dans un trade : on laisse
      if (killed) orders.splice(q, 1);
    }
    // 3) machine à états des zones (règle c4) et des FVG bruts (remplissage)
    for (const z of zones) {
      if (z.dead != null || z.entered != null || z.created === m) continue;
      const touch = z.dir < 0 ? k.h >= z.lo : k.l <= z.hi, eats = z.dir < 0 ? k.h >= z.hi : k.l <= z.lo;
      if (z.status === 'pending') { if (touch) { if (eats) z.dead = m; else if (z.dir < 0) z.lo = k.h; else z.hi = k.l; } else { z.status = 'valid'; z.vAt = m; } }
      else if (touch) { z.entered = m; if (eats) z.dead = m; }
    }
    for (const g of gaps) if (!g.filled && g.created < m) { const w = g.hi - g.lo, pen = g.dir < 0 ? (k.h - g.lo) : (g.hi - k.l); const f = w > 0 ? Math.max(0, Math.min(1, pen / w)) : (pen >= 0 ? 1 : 0); if (f > (g.pen || 0)) g.pen = f; if (g.dir < 0 ? k.h >= g.hi : k.l <= g.lo) g.filled = true; }
    if (k.h > hi) hi = k.h; if (k.l < lo) lo = k.l;
    if (m >= 2) {
      const a = c[m - 2];
      if (a.l > k.h) { const g = { dir: -1, lo: k.h, hi: a.l, created: m, filled: false }; gaps.push(g); zones.push({ dir: -1, lo: k.h, hi: a.l, created: m, status: 'pending', g }); }
      else if (a.h < k.l) { const g = { dir: 1, lo: a.h, hi: k.l, created: m, filled: false }; gaps.push(g); zones.push({ dir: 1, lo: a.h, hi: k.l, created: m, status: 'pending', g }); }
    }
    // 4) nouveaux ordres sur les zones validées, récentes, dans la plage, avec cible
    if (m < o.start || hr < o.hourFrom || hr >= o.hourTo) continue;
    for (const z of zones) {
      if (z.status !== 'valid' || z.dead != null || z.entered != null || z.ordered || m - z.created > o.maxAge) continue;
      if (pos && pos.dir === z.dir) continue; // déjà à l'intérieur dans ce sens
      const near = z.dir < 0 ? z.lo : z.hi, far = z.dir < 0 ? z.hi : z.lo;
      if (near >= hi - 1e-9 || near <= lo + 1e-9) continue;
      let tg = null;
      for (const g of gaps) { if (g.filled || g.dir === z.dir || g.created > m || (o.maxFill != null && (g.pen || 0) > o.maxFill) || (o.maxTargetAgeDays != null && k.t - c[g.created].t > o.maxTargetAgeDays * 86400)) continue; if (z.dir > 0 ? !(g.lo > near) : !(g.hi < near)) continue; if (!tg || (z.dir > 0 ? g.lo < tg.lo : g.hi > tg.hi)) tg = g; }
      let noTgRR = null; // noTargetRR (ajouté) : fonction ({ z, m }) -> RR à viser quand il n'y a aucun FVG cible (null = pas d'ordre, comme avant)
      if (!tg && !o.tpFn) { noTgRR = o.noTargetRR ? o.noTargetRR({ z, m }) : null; if (noTgRR == null) { if (o.onNoTarget) o.onNoTarget({ z, m }); continue; } } // onNoTarget (ajouté) : zone valide sans FVG cible, pour compter les jours sautés
      const entry = near + (far - near) * o.entryFraction, stop = o.stopMode === 'c1' ? (z.dir < 0 ? c[z.created - 2].h + o.stopMargin : c[z.created - 2].l - o.stopMargin) : (z.dir < 0 ? far + o.stopMargin : far - o.stopMargin), risk = Math.abs(stop - entry);
      let tp;
      if (noTgRR != null) { tp = entry + z.dir * noTgRR * risk; }
      else if (o.tpFn) { tp = o.tpFn({ z, m, entry, stop, risk }); if (tp == null) continue; }
      else {
        const tgNear = z.dir > 0 ? tg.lo : tg.hi, tgFar = z.dir > 0 ? tg.hi : tg.lo, half2 = o.tpMode === 'near' ? tgNear : o.tpMode === 'far' ? tgFar : (tg.lo + tg.hi) / 2, tpMin = entry + z.dir * o.minRR * risk;
        tp = o.tpMode === '3r' ? tpMin : (z.dir > 0 ? Math.max(half2, tpMin) : Math.min(half2, tpMin));
      }
      if (o.maxRR && Math.abs(tp - entry) / risk > o.maxRR) continue; // « trop loin » : RR visé au-delà du plafond
      if (o.filter && !o.filter({ z, m, near, far, tg, entry, stop, tp, risk, rr: Math.abs(tp - entry) / risk })) continue; // filtre optionnel (ex. balayage H4)
      let stopW = stop, riskW = risk; // stopMult : stop élargi, TP inchangé (calculé avec le risque d'origine)
      if (o.stopMult && o.stopMult !== 1) { stopW = entry - z.dir * o.stopMult * risk; riskW = Math.abs(entry - stopW); }
      if (o.onOrder) o.onOrder({ z, m, dir: z.dir }); // onOrder (ajouté) : ordre posé (rempli ou non)
      z.ordered = true; orders.push({ dir: z.dir, entry, stop: stopW, tp, risk: riskW, placedIdx: m, t: k.t, z, zone0: [z.g.lo, z.g.hi], zoneNow: [z.lo, z.hi], zCreated: z.created, target: tg ? [tg.lo, tg.hi] : [0, 0], targetCreated: tg ? tg.created : 0 });
    }
  }
  return { trades, open: pos, pending: orders.length };
}

export function stats(trades) {
  const n = trades.length, w = trades.filter((t) => t.r > 0).length, tot = trades.reduce((s, t) => s + t.r, 0);
  let eq = 0, peak = 0, dd = 0, streak = 0, maxLoss = 0;
  for (const t of trades) { eq += t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); streak = t.r <= 0 ? streak + 1 : 0; maxLoss = Math.max(maxLoss, streak); }
  return { n, wins: w, winRate: n ? w / n : 0, totalR: tot, avgR: n ? tot / n : 0, maxDrawdownR: dd, maxLossStreak: maxLoss };
}

/**
 * Balayages H4 : pour chaque bougie M15, l'indice de la dernière fois où un creux (lastLow) / sommet (lastHigh) des N dernières bougies H4 complètes
 * (alignées sur minuit NY) a été pris par une mèche. Un FVG d'achat qui se forme peu après un creux H4 pris, ou un FVG de vente peu après un sommet pris,
 * suit le sens de la liquidité H4 (observation de Krystofia : « la plupart de mes trades sont liés à un PD array H4 »).
 */
export function h4Sweeps(c, N = 6) {
  const lastLow = new Int32Array(c.length).fill(-1), lastHigh = new Int32Array(c.length).fill(-1), H = [];
  let cur = null, ll = -1, lh = -1;
  for (let m = 0; m < c.length; m++) {
    const k = c[m], key = Math.floor((k.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) { if (cur) H.push(cur); cur = { key, h: k.h, l: k.l }; } else { cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); }
    if (H.length >= N) {
      let lo = Infinity, hi = -Infinity;
      for (let q = H.length - N; q < H.length; q++) { if (H[q].l < lo) lo = H[q].l; if (H[q].h > hi) hi = H[q].h; }
      if (k.l < lo) ll = m; if (k.h > hi) lh = m;
    }
    lastLow[m] = ll; lastHigh[m] = lh;
  }
  return { lastLow, lastHigh };
}

/** Filtre « FVG formé au plus W bougies après un balayage H4 dans le sens du trade ». */
export function h4SweepFilter(c, { N = 6, W = 32 } = {}) {
  const sw = h4Sweeps(c, N);
  return ({ z }) => { const li = z.dir > 0 ? sw.lastLow[z.created] : sw.lastHigh[z.created]; return li >= 0 && z.created - li <= W; };
}
