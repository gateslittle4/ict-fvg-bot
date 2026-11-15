// Tests de comboAR_swing.mjs : empreinte, identité du moteur S avec le moteur C, agrégation, balayage daily, nuits, jugements, durée de vie des ordres.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dstHours, RULES } from './comboF.mjs';
import { backtest as backtestC } from './lib/krysBacktestC.js';
import { backtest as backtestS } from './lib/krysBacktestS.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { aggregate, dailySweeps, nights, judgeTrain, judgeTest, runYearSwing, SW1, sha256Text, PREREG_FILE, PREREG_SHA256 } from './comboAR_swing.mjs';

/** Marche aléatoire M15 (générateur congruentiel fixe), 24 h sur 24, du 2020-01-01 au 2022-01-01 UTC. */
function synth(seed = 12345, to = Date.UTC(2022, 0, 1)) {
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
  const out = []; let px = 8000;
  for (let raw = Date.UTC(2020, 0, 1); raw < to; raw += 900000) {
    const o = px, mv = rnd() * 40, c = o + mv, h = Math.max(o, c) + Math.abs(rnd()) * 12, l = Math.min(o, c) - Math.abs(rnd()) * 12; px = c;
    out.push({ t: raw / 1000 + dstHours(raw) * 3600, o, h, l, c, raw });
  }
  return out;
}
const f2opt = (c) => { const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }); return { spread: 0.6, stopMargin: 3, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5, buyOnly: true, filter: (a) => a.z.dir > 0 && sw(a) }; };

test('le pré-enregistrement sur disque a l\'empreinte figée', () => {
  assert.equal(sha256Text(fs.readFileSync(PREREG_FILE, 'utf8')), PREREG_SHA256);
});

test('moteur S sans orderMaxBars : mêmes trades que le moteur C', () => {
  const c = synth(), a = backtestC(c, f2opt(c)).trades, b = backtestS(c, f2opt(c)).trades;
  assert.ok(a.length > 50);
  assert.equal(b.length, a.length);
  for (let i = 0; i < a.length; i++) { assert.equal(b[i].fillIdx, a[i].fillIdx); assert.equal(b[i].exitIdx, a[i].exitIdx); assert.equal(b[i].r, a[i].r); }
});

test('orderMaxBars : aucun ordre rempli plus de N bougies après sa pose, et moins de trades tardifs qu\'avec une durée illimitée', () => {
  const h1 = aggregate(synth(), 3600), base = { spread: 0.6, stopMargin: 3, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 0, hourTo: 24, entryFraction: 0.5, buyOnly: true, filter: (a) => a.z.dir > 0 };
  const lim = backtestS(h1, { ...base, orderMaxBars: 40 }).trades, free = backtestS(h1, base).trades;
  assert.ok(lim.length > 20);
  assert.ok(lim.every((t) => t.fillIdx - t.placedIdx <= 40));
  assert.ok(free.some((t) => t.fillIdx - t.placedIdx > 40), 'sans limite, des ordres vivent plus de 40 bougies');
});

test('aggregate : H1 alignée sur New York, OHLC corrects', () => {
  const c = synth(1, Date.UTC(2020, 0, 3)), h1 = aggregate(c, 3600);
  assert.equal(h1.length, 48);
  const first4 = c.slice(0, 4);
  assert.equal(h1[0].o, first4[0].o); assert.equal(h1[0].c, first4[3].c);
  assert.equal(h1[0].h, Math.max(...first4.map((k) => k.h))); assert.equal(h1[0].l, Math.min(...first4.map((k) => k.l)));
  assert.equal(h1[0].raw, first4[0].raw); assert.equal(h1[1].raw, c[4].raw);
  const h4 = aggregate(c, 14400);
  // La série commence à 19 h New York : la première bougie H4 est partielle (19 h–20 h), les suivantes commencent à 20 h, 0 h, 4 h…
  assert.ok(h4.slice(1).every((k) => ((k.t - 5 * 3600) / 3600) % 4 === 0), 'H4 alignée sur minuit New York');
});

test('dailySweeps : seulement sous le plus bas des N jours complets, causal', () => {
  // 6 jours, une bougie par heure, plus bas 100 partout sauf mention.
  const bars = []; const T0 = 5 * 3600 + 86400 * 1000;
  for (let d = 0; d < 6; d++) for (let hr = 0; hr < 24; hr++) bars.push({ t: T0 + d * 86400 + hr * 3600, l: 100, h: 110 });
  bars[24 * 1 + 5].l = 95;      // jour 1 : plus bas 95 (avant d'avoir 2 jours complets : pas de balayage)
  bars[24 * 3 + 2].l = 96;      // jour 3 : 96 n'est pas sous min(jour 1, jour 2) = 95
  bars[24 * 4 + 7].l = 99;      // jour 4 : jours complets 2 et 3 -> min = 96 ; 99 ne balaie pas
  bars[24 * 5 + 1].l = 97;      // jour 5 : jours complets 3 et 4 -> min = 96 ; 97 ne balaie pas
  bars[24 * 5 + 9].l = 95.5;    // jour 5 : 95,5 < 96 -> balayage
  const sw = dailySweeps(bars, 2);
  assert.equal(sw[24 * 1 + 5], -1);
  assert.equal(sw[24 * 3 + 2], -1);
  assert.equal(sw[24 * 5 + 8], -1);
  assert.equal(sw[24 * 5 + 9], 24 * 5 + 9);
  assert.equal(sw[24 * 5 + 23], 24 * 5 + 9);
  const pre = dailySweeps(bars.slice(0, 24 * 5 + 10), 2);
  for (let m = 0; m < pre.length; m++) assert.equal(pre[m], sw[m]);
});

test('nights : passages de 17 h New York', () => {
  const ny = (d, hr) => 5 * 3600 + d * 86400 + hr * 3600; // temps moteur
  assert.equal(nights(ny(10, 9), ny(10, 16)), 0);
  assert.equal(nights(ny(10, 16), ny(10, 18)), 1);
  assert.equal(nights(ny(10, 18), ny(11, 16)), 0);
  assert.equal(nights(ny(10, 9), ny(13, 9)), 3); // vendredi -> lundi : 3 nuits (triple swap)
});

test('judgeTrain et judgeTest', () => {
  const mk = (n, Y, win) => Array.from({ length: n }, (_, i) => ({ Y, r: i % win === 0 ? 3 : -1 }));
  const good = [...mk(120, 2012, 3), ...mk(120, 2019, 3)]; // 1 gagnant sur 3 à +3 : +0,33 R
  assert.equal(judgeTrain(good).verdict, 'PASSE');
  assert.equal(judgeTrain(good.slice(0, 149)).verdict, 'NON_JUGEABLE');
  assert.equal(judgeTrain([...mk(120, 2012, 5), ...mk(120, 2019, 3)]).verdict, 'REJETEE'); // première moitié négative
  assert.equal(judgeTrain([...mk(120, 2012, 4), ...mk(120, 2019, 4)]).verdict, 'REJETEE'); // R moyen 0
  assert.equal(judgeTest(mk(90, 2024, 3)), true);
  assert.equal(judgeTest(mk(90, 2024, 4)), false);
});

test('runYearSwing : R net = R brut − swap, trades de l\'année demandée seulement', () => {
  const h1 = aggregate(synth(), 3600), T = runYearSwing(h1, 2021, SW1, { raw: true }), T0 = runYearSwing(h1, 2021, SW1, { raw: true, swapYear: 0 });
  assert.ok(T.length > 10);
  assert.equal(T0.length, T.length);
  for (let i = 0; i < T.length; i++) { assert.equal(T0[i].r, T0[i].gross); assert.ok(T[i].r <= T[i].gross); if (T[i].nights === 0) assert.equal(T[i].r, T[i].gross); else assert.ok(T[i].r < T[i].gross); }
  assert.ok(T.every((t) => t.Y === 2021));
});
