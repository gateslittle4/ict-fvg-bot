// Cahier des charges de Gemini (30/09) appliqué à la lettre sur les 11 exemples — DÉTECTION seulement (aucune performance lue).
// Ancre 4hr = plus haut/bas des 64 bougies M15 précédentes ; balayage = mèche au-delà ; sens = retournement.
// FVG d'entrée = FVG de sens retournement formé après le balayage (le dernier formé remplace l'ordre tant que non rempli).
// Stop = extrême du balayage ± 2 points ; cible = bord « proximal » du premier FVG opposé non comblé sur le chemin ; expiration 16 bougies ;
// ordre annulé si la cible est touchée avant le remplissage. Deux versions des bords : LITTERAL (texte de Gemini) et CORRIGE.
// Heures en UTC (axe des graphiques d'Esdras). Lancer : node scripts/research-fvg-esdras/exp-gemini.mjs
import fs from 'node:fs';
const DIR = 'data/esdras-examples/';
const load = (s) => JSON.parse(fs.readFileSync(`${DIR}live-${s}.json`, 'utf8')).candles.slice(0, -1);
const BARS = { US100: load('US100'), US500: load('US500') };
const M15 = 900000, LOOK = 64, BUF = 2, EXPIRY = 16;
const utc = (t) => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
const day = (s) => Date.parse(s + 'T00:00:00Z');

// entrée = boîte dessinée par Esdras (±marge), cible = FVG « à gauche » dessiné
const EX = [
  { n: '1 US100 14/09', s: 'US100', dir: 1, lo: 28850, hi: 28915, tLo: 29000, tHi: 29050, tol: 15, from: '2026-09-13', to: '2026-09-16' },
  { n: '2 US100 18/09', s: 'US100', dir: -1, lo: 29610, hi: 29650, tLo: 29420, tHi: 29455, tol: 15, from: '2026-09-17', to: '2026-09-19' },
  { n: '3 US100 23/09', s: 'US100', dir: -1, lo: 30715, hi: 30780, tLo: 30535, tHi: 30625, tol: 15, from: '2026-09-22', to: '2026-09-24' },
  { n: '4 US100 22/09', s: 'US100', dir: 1, lo: 30510, hi: 30545, tLo: 30605, tHi: 30635, tol: 15, from: '2026-09-21', to: '2026-09-23' },
  { n: '5 US100 24/09', s: 'US100', dir: 1, lo: 30250, hi: 30290, tLo: null, tHi: null, tol: 15, from: '2026-09-23', to: '2026-09-25' },
  { n: '6 US500 29/09', s: 'US500', dir: -1, lo: 7697, hi: 7703, tLo: 7677, tHi: 7684, tol: 3, from: '2026-09-28', to: '2026-09-30' },
  { n: '7a US500 11/09', s: 'US500', dir: 1, lo: 7628, hi: 7635, tLo: 7670, tHi: 7678, tol: 3, from: '2026-09-10', to: '2026-09-12' },
  { n: '7b US500 11/09', s: 'US500', dir: 1, lo: 7620, hi: 7626, tLo: 7670, tHi: 7678, tol: 3, from: '2026-09-10', to: '2026-09-12' },
  { n: '8 US500 14/09', s: 'US500', dir: 1, lo: 7600, hi: 7610, tLo: 7632, tHi: 7637, tol: 3, from: '2026-09-13', to: '2026-09-16' },
  { n: '9 US500 18/09', s: 'US500', dir: -1, lo: 7660, hi: 7670, tLo: 7628, tHi: 7635, tol: 3, from: '2026-09-17', to: '2026-09-19' },
  { n: '10 US500 23/09', s: 'US500', dir: -1, lo: 7738, hi: 7748, tLo: 7708, tHi: 7712, tol: 3, from: '2026-09-22', to: '2026-09-24' },
];

/** Tous les FVG à 3 bougies contiguës. inf/sup = bornes du gap ; k = indice de la 3e bougie. */
function allFvgs(b) {
  const out = [];
  for (let k = 2; k < b.length; k++) {
    if (b[k].time - b[k - 2].time !== 2 * M15) continue;
    if (b[k - 2].high < b[k].low) out.push({ dir: 1, k, inf: b[k - 2].high, sup: b[k].low });
    else if (b[k - 2].low > b[k].high) out.push({ dir: -1, k, inf: b[k].high, sup: b[k - 2].low });
  }
  return out;
}
// Bord d'entrée. LITTERAL (Gemini) : achat High(k-2) = inf, vente Low(k-2) = sup. CORRIGE : bord touché en premier au retour (achat sup, vente inf).
const entryEdge = (z, mode) => (mode === 'LITTERAL' ? (z.dir > 0 ? z.inf : z.sup) : (z.dir > 0 ? z.sup : z.inf));
// Bord « proximal » d'une cible opposée (même convention de Gemini appliquée à elle).
const targetEdge = (L, mode) => (mode === 'LITTERAL' ? (L.dir > 0 ? L.inf : L.sup) : (L.dir > 0 ? L.sup : L.inf));
// Comblé entièrement avant t ? (le prix a traversé tout le gap)
function filledBefore(b, L, t) {
  for (let j = L.k + 1; j < t; j++) if (L.dir > 0 ? b[j].low <= L.inf : b[j].high >= L.sup) return true;
  return false;
}

/** Simule le cahier de Gemini sur une paire ; retourne les setups (ordres posés) avec leur sort. */
function run(b, mode) {
  const fv = allFvgs(b), byK = new Map(); for (const z of fv) byK.set(z.k, [...(byK.get(z.k) || []), z]);
  const setups = [];
  let anchor = null; // { dir (sens du trade), ext, t0, entries }
  let order = null;
  for (let t = LOOK; t < b.length; t++) {
    const c = b[t];
    // 1) ordre en cours : remplissage / annulation (cible touchée) / expiration
    if (order && !order.done) {
      const buy = order.dir > 0;
      if (buy ? c.high >= order.target : c.low <= order.target) { if (!order.filled) { order.done = 'annulé (cible touchée avant)'; } }
      if (!order.done && !order.filled && (buy ? c.low <= order.entry : c.high >= order.entry)) { order.filled = true; order.fillT = c.time; }
      if (!order.done && !order.filled && t - order.kPlaced > EXPIRY) order.done = 'expiré';
      if (order.filled) order.done = 'rempli';
    }
    // 2) balayage d'un plus haut/bas des 64 bougies précédentes
    let hi = -Infinity, lo = Infinity;
    for (let j = t - LOOK; j < t; j++) { hi = Math.max(hi, b[j].high); lo = Math.min(lo, b[j].low); }
    if (c.high > hi) { if (!anchor || anchor.dir !== -1) anchor = { dir: -1, ext: c.high, t0: t, level: hi, entries: 0 }; else anchor.ext = Math.max(anchor.ext, c.high); }
    if (c.low < lo) { if (!anchor || anchor.dir !== 1) anchor = { dir: 1, ext: c.low, t0: t, level: lo, entries: 0 }; else anchor.ext = Math.min(anchor.ext, c.low); }
    // 3) FVG formé à la clôture de t dans le sens du retournement
    for (const z of byK.get(t) || []) {
      if (!anchor || z.dir !== anchor.dir || z.k - 2 < anchor.t0 - 1) continue;
      if (anchor.entries >= 2) continue;
      if (order && !order.filled && !order.done) order.done = 'remplacé par un FVG plus récent';
      else if (order && order.filled && order.anchorT0 === anchor.t0) anchor.entries++;
      const entry = entryEdge(z, mode), stop = anchor.dir > 0 ? anchor.ext - BUF : anchor.ext + BUF;
      // cible : premier FVG opposé non comblé, formé avant, dont le bord est devant l'entrée
      let best = null;
      for (const L of fv) {
        if (L.dir !== -z.dir || L.k >= z.k - 2) continue;
        const e = targetEdge(L, mode);
        if (z.dir > 0 ? !(e > entry) : !(e < entry)) continue;
        if (filledBefore(b, L, t + 1)) continue;
        if (!best || (z.dir > 0 ? e < best.e : e > best.e)) best = { L, e };
      }
      if (!best) continue;
      order = { dir: z.dir, z, entry, stop, target: best.e, tz: best.L, kPlaced: t, anchorT0: anchor.t0, sweepLevel: anchor.level, sweepExt: anchor.ext, sweepT: b[anchor.t0].time };
      setups.push(order);
    }
  }
  return setups;
}

const inBox = (p, lo, hi, tol) => p >= lo - tol && p <= hi + tol;
for (const mode of ['LITTERAL', 'CORRIGE']) {
  console.log(`\n==================== Bords ${mode} ====================`);
  const S = { US100: run(BARS.US100, mode), US500: run(BARS.US500, mode) };
  let nDir = 0, nEntry = 0, nFull = 0;
  for (const ex of EX) {
    const b = BARS[ex.s];
    const win = S[ex.s].filter((o) => b[o.kPlaced].time >= day(ex.from) && b[o.kPlaced].time < day(ex.to));
    const same = win.filter((o) => o.dir === ex.dir && o.done === 'rempli');
    const eHit = same.filter((o) => inBox(o.entry, ex.lo, ex.hi, ex.tol));
    const full = eHit.filter((o) => ex.tLo != null && inBox(o.target, ex.tLo, ex.tHi, ex.tol));
    if (same.length) nDir++; if (eHit.length) nEntry++; if (full.length) nFull++;
    const perDay = (win.length / ((day(ex.to) - day(ex.from)) / 86400000)).toFixed(1);
    console.log(`\n${ex.n} (${ex.dir > 0 ? 'achat' : 'vente'}, boîte ${ex.lo}-${ex.hi}, cible Esdras ${ex.tLo ?? '—'}-${ex.tHi ?? '—'}) : ${win.length} ordres posés (${perDay}/jour), ${same.length} remplis dans son sens`);
    console.log(`   sens ${same.length ? '✅' : '❌'} | entrée dans sa boîte ${eHit.length ? '✅' : '❌'} | + cible = son FVG à gauche ${full.length ? '✅' : '❌'}`);
    for (const o of (eHit.length ? eHit : same).slice(0, 3)) {
      console.log(`   → ${utc(b[o.kPlaced].time)} UTC balayage ${o.dir > 0 ? 'bas' : 'haut'} ${o.sweepLevel} (${utc(o.sweepT)}) ext ${o.sweepExt} | FVG ${o.z.inf}-${o.z.sup} | entrée ${o.entry} stop ${o.stop} cible ${o.target} | rempli ${utc(o.fillT)}`);
    }
  }
  console.log(`\nBilan ${mode} : sens ${nDir}/11 → entrée dans la boîte ${nEntry}/11 → entrée + cible ${nFull}/10 (ex. 5 sans cible dessinée)`);
}
// Distance entre ce que Gemini produirait et la boîte d'Esdras : le FVG d'entrée d'Esdras se forme-t-il APRÈS un balayage de 64 bougies ?
const S = { US100: run(BARS.US100, 'CORRIGE'), US500: run(BARS.US500, 'CORRIGE') };
console.log('\n==================== Diagnostic (bords corrigés) ====================');
console.log('Exemple           | FVG d\'entrée d\'Esdras formé à UTC | a-t-il un balayage 64 bougies avant ? | plus proche ordre Gemini | écart');
for (const ex of EX) {
  const b = BARS[ex.s];
  // FVG d'entrée d'Esdras : un FVG de son sens dont un bord est dans sa boîte, formé dans la fenêtre
  let es = null;
  for (let k = 2; k < b.length; k++) {
    if (b[k].time - b[k - 2].time !== 2 * M15) continue;
    const d3 = b[k - 2].high < b[k].low ? 1 : (b[k - 2].low > b[k].high ? -1 : 0);
    if (d3 !== ex.dir) continue;
    const inf = ex.dir > 0 ? b[k - 2].high : b[k].high, sup = ex.dir > 0 ? b[k].low : b[k - 2].low;
    if (b[k].time < day(ex.from) || b[k].time >= day(ex.to)) continue;
    if (!(inf <= ex.hi + ex.tol && sup >= ex.lo - ex.tol)) continue;
    es = { k, t: b[k].time, inf, sup }; break;
  }
  const win = S[ex.s].filter((o) => b[o.kPlaced].time >= day(ex.from) && b[o.kPlaced].time < day(ex.to));
  // plus proche en TEMPS d'un FVG d'Esdras qui touche sa boîte
  let near = null;
  for (const o of win) {
    const e = o.z.dir > 0 ? o.z.sup : o.z.inf;
    if (!(e <= ex.hi + ex.tol && o.z.sup >= ex.lo - ex.tol)) continue;
    const d = Math.abs(b[o.kPlaced].time - (es ? es.t : b[o.kPlaced].time));
    if (!near || d < near.d) near = { o, d };
  }
  let hWin = -Infinity, lWin = Infinity;
  for (let j = es ? es.k - 64 : 0, t = es ? es.k : 0; j < t; j++) { hWin = Math.max(hWin, b[j].high); lWin = Math.min(lWin, b[j].low); }
  let swept = false, nF = 0;
  // pour chaque bougie j avant le FVG : son plus haut/bas dépasse-t-il l'extrême des 64 bougies qui la précèdent ?
  for (let j = Math.max(64, es ? es.k - 64 : 0); j <= (es ? es.k - 3 : -1); j++) {
    let hh = -Infinity, ll = Infinity;
    for (let m = j - 64; m < j; m++) { hh = Math.max(hh, b[m].high); ll = Math.min(ll, b[m].low); }
    if (b[j].high > hh || b[j].low < ll) { swept = true; nF++; }
  }
  void hWin; void lWin;
  console.log(`${ex.n.padEnd(17)} | ${es ? utc(es.t) : 'introuvable'.padEnd(28)} | ${es ? (swept ? `✅ oui (${nF} bougies)` : '❌ aucun balayage') : '—'} | ${near ? `${utc(b[near.o.kPlaced].time)} (${near.d / 3600000} h après)` : 'aucun ordre sur la boîte'} | ${near && es ? (near.o.z.dir > 0 ? near.o.z.sup : near.o.z.inf) : ''}`);
}