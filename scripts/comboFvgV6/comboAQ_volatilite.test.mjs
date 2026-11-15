// Tests de comboAQ_volatilite.mjs : empreinte, régime de volatilité (causal, médiane), Welch, jugements.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { volRegime, welch, judgeTrain, judgeTest, sha256Text, PREREG_FILE, PREREG_SHA256 } from './comboAQ_volatilite.mjs';

test('le pré-enregistrement sur disque a l\'empreinte figée', () => {
  assert.equal(sha256Text(fs.readFileSync(PREREG_FILE, 'utf8')), PREREG_SHA256);
});

/** Série M15 synthétique : jours NY (t en temps moteur), 4 bougies par jour, amplitude par jour donnée par amp(d). */
function days(nDays, amp) {
  const out = []; let px = 1000;
  for (let d = 0; d < nDays; d++) for (let q = 0; q < 4; q++) {
    const t = 5 * 3600 + d * 86400 + q * 900 + 10 * 3600, a = amp(d); // 10 h après minuit NY
    const o = px, c = o + (q % 2 ? a / 8 : -a / 8), h = Math.max(o, c) + a / 2, l = Math.min(o, c) - a / 2; px = c;
    out.push({ t, o, h, l, c, raw: t * 1000 });
  }
  return out;
}

test('volRegime : calme tant qu\'il manque d\'historique, puis élevé quand l\'amplitude du dernier jour complet dépasse la médiane', () => {
  // 200 jours à amplitude 10, puis 60 jours à amplitude 30 : le régime passe à élevé une fois ATRrel (14 j) au-dessus de la médiane des 120 j précédents.
  const c = days(260, (d) => (d < 200 ? 10 : 30)), reg = volRegime(c);
  const dayOf = (m) => Math.floor(m / 4);
  assert.equal(reg[0], 0);
  assert.equal(reg[4 * 100], 0, 'jour 100 : pas encore 134 jours complets');
  assert.equal(reg[4 * 180], 0, 'jour 180 : amplitude constante, ATRrel = médiane, pas strictement supérieur -> calme');
  assert.equal(reg[4 * 201], 1, 'jour 201 : le jour 200 (ampl. 30) est complet, ATRrel 14 j dépasse la médiane');
  assert.equal(reg[4 * 200], 0, 'jour 200 : seul le jour 199 est complet (ampl. 10) -> calme : causal');
  assert.ok(reg.slice(4 * 201, 4 * 260).every((v) => v === 1));
  assert.equal(dayOf(4 * 201), 201);
});

test('volRegime : indépendant du futur (préfixe identique)', () => {
  const c = days(300, (d) => 10 + (d * 7) % 13), full = volRegime(c), pre = volRegime(c.slice(0, 4 * 250));
  for (let m = 0; m < pre.length; m++) assert.equal(pre[m], full[m]);
});

test('welch : signe et ordre de grandeur', () => {
  const a = [1, 2, 3, 4, 5], b = [0, 1, 2, 3, 4];
  assert.ok(Math.abs(welch(a, b) - 1) < 1e-9);
  assert.ok(welch(b, a) < 0);
});

test('judgeTrain : les quatre critères', () => {
  const hi = Array.from({ length: 600 }, (_, i) => (i % 4 === 0 ? 3 : -1) + 0.3), lo = Array.from({ length: 622 }, (_, i) => (i % 4 === 0 ? 3 : -1) - 0.3);
  const ok = judgeTrain({ hi, lo, hiA: hi.slice(0, 300), hiB: hi.slice(300), nAll: 1222 });
  assert.ok(ok.c1 && ok.c2 && ok.c3 && ok.c4 && ok.pass);
  assert.equal(judgeTrain({ hi, lo, hiA: hi.slice(0, 300), hiB: hi.slice(300), nAll: 3000 }).c4, false); // < 30 %
  assert.equal(judgeTrain({ hi: lo, lo: hi, hiA: lo.slice(0, 300), hiB: lo.slice(300), nAll: 1222 }).c1, false); // élevé < calme
  assert.equal(judgeTrain({ hi, lo, hiA: hi.map((r) => r - 10), hiB: hi.slice(300), nAll: 1222 }).c3, false);
});

test('judgeTest : élevé > calme, > 0 et t ≥ 1', () => {
  const hi = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? 3 : -1) + 0.5), lo = hi.map((r) => r - 1);
  assert.equal(judgeTest({ hi, lo }), true);
  assert.equal(judgeTest({ hi: lo, lo: hi }), false);
  assert.equal(judgeTest({ hi: [0.01, -0.01, 0.02], lo: [-1, -1] }), false); // t trop faible ? moyenne 0,0067, sd 0,015 -> t 0,77
});
