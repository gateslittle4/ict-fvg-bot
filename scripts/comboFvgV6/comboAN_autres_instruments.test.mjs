// Tests de comboAN_autres_instruments.mjs : verdict, empreinte, agrégation M1 -> M15 et identité avec F2C (comboT.mjs) sur des données synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dstHours } from './comboF.mjs';
import { runYearTRaw } from './comboT.mjs';
import { verdict, toM15, runYearF2, sha256Text, PREREG_FILE, PREREG_SHA256 } from './comboAN_autres_instruments.mjs';

/** Marche aléatoire M15 (générateur congruentiel fixe), 24 h sur 24, du 2020-01-01 au 2022-01-01 UTC. */
function synth(seed = 12345) {
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
  const out = []; let px = 8000;
  for (let raw = Date.UTC(2020, 0, 1); raw < Date.UTC(2022, 0, 1); raw += 900000) {
    const o = px, mv = rnd() * 40, c = o + mv, h = Math.max(o, c) + Math.abs(rnd()) * 12, l = Math.min(o, c) - Math.abs(rnd()) * 12; px = c;
    out.push({ t: raw / 1000 + dstHours(raw) * 3600, o, h, l, c, raw });
  }
  return out;
}

test('verdict : les quatre niveaux et leurs frontières', () => {
  const ok = { pooled: { avgR: 0.1, t: 2.1 }, halves: [0.05, 0.15], perInstrument: [0.02, 0.18], control: true };
  assert.equal(verdict(ok), 'REPLIQUEE');
  assert.equal(verdict({ ...ok, pooled: { avgR: 0.1, t: 1.96 } }), 'REPLIQUEE'); // t = 1,96 pile passe
  assert.equal(verdict({ ...ok, pooled: { avgR: 0.1, t: 1.9 } }), 'COMPATIBLE_NON_PROUVEE');
  assert.equal(verdict({ ...ok, halves: [-0.01, 0.2] }), 'COMPATIBLE_NON_PROUVEE'); // une période négative
  assert.equal(verdict({ ...ok, perInstrument: [-0.01, 0.3] }), 'COMPATIBLE_NON_PROUVEE'); // un instrument négatif
  assert.equal(verdict({ ...ok, control: false }), 'COMPATIBLE_NON_PROUVEE');
  assert.equal(verdict({ ...ok, pooled: { avgR: 0.03, t: 1.0 } }), 'COMPATIBLE_NON_PROUVEE'); // t = 1,0 pile
  assert.equal(verdict({ ...ok, pooled: { avgR: 0.03, t: 0.99 } }), 'INDISCERNABLE_DU_ZERO');
  assert.equal(verdict({ ...ok, pooled: { avgR: 0, t: 0 } }), 'NON_REPLIQUEE');
  assert.equal(verdict({ ...ok, pooled: { avgR: -0.2, t: -3 } }), 'NON_REPLIQUEE');
});

test('empreinte : fins de ligne Windows et Linux donnent la même valeur, et le pré-enregistrement du dépôt correspond', () => {
  assert.equal(sha256Text('a\r\nb\r\n'), sha256Text('a\nb\n'));
  assert.notEqual(sha256Text('a\nb\n'), sha256Text('a\nc\n'));
  assert.equal(sha256Text(fs.readFileSync(PREREG_FILE, 'utf8')), PREREG_SHA256);
});

test('toM15 : agrège 15 minutes, garde ouverture / haut / bas / clôture, et décale t de l\'heure d\'été', () => {
  const base = Date.UTC(2021, 6, 6, 12, 0); // juillet : heure d'été US
  const rows = [[base, 10, 11, 9, 10.5], [base + 60000, 10.5, 13, 10, 12], [base + 14 * 60000, 12, 12.5, 8, 9], [base + 15 * 60000, 9, 9.5, 8.5, 9.2]];
  const m = toM15(rows);
  assert.equal(m.length, 2);
  assert.deepEqual([m[0].o, m[0].h, m[0].l, m[0].c, m[0].raw], [10, 13, 8, 9, base]);
  assert.equal(m[0].t, base / 1000 + 3600);
  assert.equal(m[1].raw, base + 900000);
});

test('runYearF2 redonne exactement les trades de F2C (runYearTRaw de comboT.mjs) sur données synthétiques', () => {
  const all = synth();
  for (const Y of [2020, 2021]) {
    const mine = runYearF2(all, Y), ref = runYearTRaw(all, Y, {});
    assert.ok(mine && ref, 'année exploitable');
    assert.ok(ref.T.length > 5, `il faut des trades pour que le test ait un sens (obtenu ${ref.T.length})`);
    assert.deepEqual(mine.map((t) => t.r), ref.T.map((t) => t.r));
    assert.deepEqual(mine.map((t) => t.placedT), ref.T.map((t) => t.t));
  }
});

test('runYearF2 : les achats sans filtre contiennent au moins les trades filtrés en nombre, et un spread plus large ne change pas le nombre d\'ordres posés de plus de 10 %', () => {
  const all = synth(777), f = runYearF2(all, 2021), r = runYearF2(all, 2021, { raw: true }), w = runYearF2(all, 2021, { spreadMult: 2 });
  assert.ok(r.length >= f.length, `raw ${r.length} >= filtré ${f.length}`);
  assert.ok(Math.abs(w.length - f.length) <= Math.max(2, 0.1 * f.length), `spread x2 : ${w.length} vs ${f.length}`);
});

test('runYearF2 : une année avec moins de 1000 bougies donne null', () => {
  assert.equal(runYearF2(synth().slice(0, 500), 2020), null);
});
