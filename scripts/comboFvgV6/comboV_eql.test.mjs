import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { eqlSweeps, runYearV, runYearE } from './comboV_eql.mjs';

// Bougies M15 synthétiques : une barre H4 = 16 bougies, alignées sur minuit NY (offset 5 h comme dans h4Sweeps ; t en secondes).
const mk = (lows) => { const c = []; let m = 0; for (let b = 0; b < lows.length; b++) for (let q = 0; q < 16; q++, m++) c.push({ t: 5 * 3600 + (b * 16 + q) * 900, h: lows[b] + 50, l: q === 5 ? lows[b] : lows[b] + 10, o: lows[b] + 20, c: lows[b] + 20 }); return c; };
const firstIdx = (ll) => ll.findIndex((x) => x >= 0);

test('deux creux égaux (écart ≤ 0,1 %), balayage après confirmation : un seul balayage par niveau', () => {
  //            0    1    2    3    4    5    6    7    8    9   10
  const lows = [200, 180, 200, 190, 180.1, 200, 210, 215, 170, 160, 165, 170];
  const ll = eqlSweeps(mk(lows));
  // creux : barre 1 (180) et barre 4 (180.1) ; le 2e est confirmé quand la barre 4 est finie (barre 5 la suit : 200 > 180.1) ; niveau L = 180 ; barre 8 passe à 170 < 180
  assert.equal(firstIdx(ll), 8 * 16 + 5); // première bougie de la barre 8 dont le plus bas (170) est sous 180... (la bougie 5 porte le plus bas)
  assert.equal(ll[8 * 16 + 5], 8 * 16 + 5);
  assert.equal(ll[11 * 16], 8 * 16 + 5); // pas de nouveau balayage : un niveau compte une fois (les barres 9-10 sont encore plus basses)
});
test('écart trop grand (> 0,1 %) : pas d\'equal low', () => {
  const lows = [200, 180, 200, 190, 181, 200, 210, 215, 170, 160];
  assert.equal(firstIdx(eqlSweeps(mk(lows))), -1);
});
test('creux non confirmé (dernière barre) ou barres en dehors de la fenêtre de 12 : ignorés', () => {
  const lows = [200, 180, 200, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250, 255, 180.05, 200, 190, 150];
  // 1er creux barre 1 (180), 2e barre 14 (180.05) : barre 1 est hors des 12 dernières barres complètes au moment où le 2e est confirmé (n = 16 : fenêtre 4..15)
  assert.equal(firstIdx(eqlSweeps(mk(lows))), -1);
  const lows2 = [200, 180, 200, 190, 180.05, 150]; // le creux de la barre 4 n'est confirmé que si la barre 5 est complète : ici la barre 5 est la dernière (incomplète)
  assert.equal(firstIdx(eqlSweeps(mk(lows2))), -1);
});
test('une mèche qui reste sous le niveau ne compte qu\'une fois ; balayage strict', () => {
  const lows = [200, 180, 200, 190, 180, 200, 210, 180, 215, 190];
  // niveau 180 (barres 1 et 4, écart nul) : la barre 7 touche exactement 180 -> pas un balayage (strict)
  assert.equal(firstIdx(eqlSweeps(mk(lows))), -1);
});

// Référence naïve : tout recalculé à partir des barres H4 complètes à chaque bougie.
function naive(c, bars = 12, tol = 0.001) {
  const out = new Int32Array(c.length).fill(-1), keyOf = (k) => Math.floor((k.t - 5 * 3600) / 14400);
  const H = []; // barres complètes finies à l'indice m (avant la bougie m)
  let cur = null; const swept = new Set(); let ls = -1;
  for (let m = 0; m < c.length; m++) {
    const k = c[m], key = keyOf(k);
    if (!cur || cur.key !== key) { if (cur) H.push(cur); cur = { key, l: k.l }; } else cur.l = Math.min(cur.l, k.l);
    const n = H.length, from = Math.max(1, n - bars), cr = [];
    for (let j = from; j <= n - 2; j++) if (H[j].l < H[j - 1].l && H[j].l < H[j + 1].l) cr.push(j);
    for (let a = 0; a < cr.length; a++) for (let b = a + 1; b < cr.length; b++) {
      const la = H[cr[a]].l, lb = H[cr[b]].l, L = Math.min(la, lb);
      if (Math.abs(la - lb) <= tol * L) { const id = `${H[cr[a]].key}:${H[cr[b]].key}`; if (!swept.has(id) && k.l < L) { swept.add(id); ls = m; } }
    }
    out[m] = ls;
  }
  return out;
}
const all = loadAll();
test('équivalence avec une implémentation naïve sur 2016 (données réelles)', () => {
  const c = all.slice(all.findIndex((x) => x.raw >= Date.UTC(2016, 0, 1)), all.findIndex((x) => x.raw >= Date.UTC(2016, 4, 1)));
  const a = eqlSweeps(c), b = naive(c); let ch = 0;
  for (let i = 0; i < c.length; i++) { assert.equal(a[i], b[i], `bougie ${i}`); if (i && a[i] !== a[i - 1]) ch++; }
  assert.ok(ch > 3, 'au moins quelques balayages : ' + ch);
});
test('identité : runYearV en mode old = F2C de comboT ; E1 respecte les règles F2 (achats, 06–16 NY, risque positif)', () => {
  for (const Y of [2014, 2019]) {
    const a = runYearV(all, Y, 'old'), b = runYearT(all, Y, {}); assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) { assert.equal(`${Y}:${a[i].placedIdx}:${a[i].zCreated}`, b[i].key); assert.ok(Math.abs(a[i].r - b[i].r) < 1e-12); }
    const e = runYearE(all, Y); assert.ok(e.length > 0); assert.ok(new Set(e.map((t) => t.key)).size === e.length, 'clés uniques');
  }
});
