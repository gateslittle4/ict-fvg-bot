import test from 'node:test';
import assert from 'node:assert/strict';
import { obBacktest, bullFvgM5 } from './lib/obEngine.js';
import { toBars, judgeOB, runYearOBRaw } from './comboAI_ob_m5.mjs';

// Série synthétique (M15, heure NY de la bougie 0 = 08:00). Structure :
//  0-2 : FVG M15 baissier [125,130] (cible lointaine) ; 1->3 : FVG baissier [113,121] (cible la plus proche) ;
//  3 : OB (baissière, mèche à mèche [103,113]) = c1 du FVG M15 haussier [113,114] formé à la clôture de 5 (c3) ;
//  M5 de la bougie 3 : A(h 106), B, C(l 108) -> FVG M5 haussier [106,108] dans l'OB, entrée à 50 % = 107 ; stop = 103 - 0,5 = 102,5 ; risque 4,5 ; TP = max(117 ; 107 + 13,5) = 120,5 (3 R).
const MS = 900000;
const START = Date.UTC(2014, 0, 15, 13, 0); // 13:00 UTC = 08:00 NY (hiver, décalage 5 h)
const bar = (o, h, l, c) => ({ o, h, l, c });
const base15 = () => [
  bar(133, 135, 130, 131), bar(131, 132, 121, 122), bar(122, 125, 118, 119), bar(112, 113, 103, 104), bar(109, 118, 108, 117), bar(117, 120, 114, 119),
  bar(119, 120, 106.5, 108), bar(108, 122, 107.5, 121), ...Array.from({ length: 24 }, () => bar(121, 122, 120, 121)),
];
function build({ edit15, edit5, start = START } = {}) {
  const b = base15(); if (edit15) edit15(b);
  const c = b.map((x, i) => { const raw = start + i * MS; return { ...x, raw, t: raw / 1000 }; });
  const c5 = []; // M5 : copies des M15, sauf la bougie 3 (A, B, C construites pour le test)
  c.forEach((x, i) => {
    const three = i === 3 ? [bar(104, 106, 103, 105), bar(105, 110, 105, 109), bar(109, 113, 108, 110)] : [x, x, x];
    three.forEach((y, n) => { const raw = x.raw + n * 300000; c5.push({ o: y.o, h: y.h, l: y.l, c: y.c, raw, t: raw / 1000 }); });
  });
  if (edit5) edit5(c5);
  return { c, c5 };
}
const O = { spread: 0, stopMargin: 0.5, minRR: 3, hourFrom: 6, hourTo: 16, sweep: () => true };
const run = (spec = {}, opt = {}) => { const { c, c5 } = build(spec); const stages = []; const r = obBacktest(c, c5, { ...O, ...opt, onStage: (n) => stages.push(n) }); return { ...r, stages }; };
// Pour les tests de durée : les bougies 6.. restent entre le stop et le TP sans toucher 107 (sauf mention)
const quiet = (b) => { for (let i = 6; i < b.length; i++) b[i] = bar(118, 119, 115, 118); };

test('cas nominal : OB + FVG M5 dedans, ordre à 107, stop 102,5, TP 120,5, rempli en 6, TP en 7 (3 R)', () => {
  const { trades, stages } = run();
  assert.deepEqual(stages, ['fvg_sweep', 'ob', 'm5', 'untouched', 'target', 'order']);
  assert.equal(trades.length, 1);
  const t = trades[0]; assert.equal(t.entry, 107); assert.equal(t.stop, 102.5); assert.equal(t.tp, 120.5); assert.equal(t.placedIdx, 5); assert.equal(t.fillIdx, 6); assert.equal(t.why, 'tp');
  assert.ok(Math.abs(t.r - 3) < 1e-9);
});

test('stop et remplissage dans la même bougie : stop compté (-1 R)', () => {
  const { trades } = run({ edit15: (b) => { b[6] = bar(119, 120, 102, 108); } });
  assert.equal(trades.length, 1); assert.equal(trades[0].why, 'stop'); assert.equal(trades[0].r, -1); assert.equal(trades[0].fillIdx, 6);
});

test('le stop passe avant le TP quand les deux sont touchés dans la même bougie après le remplissage', () => {
  const { trades } = run({ edit15: (b) => { b[7] = bar(108, 125, 102, 121); } });
  assert.equal(trades[0].why, 'stop'); assert.equal(trades[0].exitIdx, 7);
});

test('pas d\'OB : c1 et la bougie avant sont haussières -> aucun ordre', () => {
  const { trades, stages } = run({ edit15: (b) => { b[3] = bar(104, 113, 103, 112); b[2] = bar(119, 125, 118, 123); } }); // 3 et 2 haussières
  assert.equal(trades.length, 0); assert.ok(!stages.includes('ob'));
});

test('OB = la bougie juste avant c1 quand c1 est haussière', () => {
  // c1 = 3 haussière (o104 c112), la bougie 2 est baissière (o122 c119, zone [118,125]) : l'OB est la 2, FVG M5 doit être dans [118,125] -> aucun ici
  const { trades, stages } = run({ edit15: (b) => { b[3] = bar(104, 113, 103, 112); } });
  assert.ok(stages.includes('ob')); assert.equal(trades.length, 0); assert.ok(!stages.includes('m5'));
});

test('FVG M5 pas entièrement dans l\'OB (haut 114 > 113) : aucun ordre', () => {
  const { trades, stages } = run({ edit5: (c5) => { const C = c5[3 * 3 + 2]; C.l = 114; C.h = 116; } });
  assert.equal(trades.length, 0); assert.ok(stages.includes('ob') && !stages.includes('m5'));
});

test('niveau d\'entrée déjà touché avant la clôture de m : aucun ordre', () => {
  const { trades, stages } = run({ edit5: (c5) => { c5[4 * 3].l = 106.5; } });
  assert.equal(trades.length, 0); assert.ok(stages.includes('m5') && !stages.includes('untouched'));
});

test('pas de cible (aucun FVG baissier) : aucun ordre', () => {
  const { trades, stages } = run({ edit15: (b) => { b[0] = bar(133, 135, 124, 131); b[1] = bar(131, 132, 112, 122); } });
  assert.equal(trades.length, 0); assert.ok(stages.includes('untouched') && !stages.includes('target'));
});

test('cible = FVG baissier non rempli le plus proche au-dessus de l\'entrée ; un FVG déjà rempli est ignoré', () => {
  // la bougie 4 (h 122 >= 121) remplit [113,121] : reste [125,130] -> TP = max(127,5 ; 120,5) = 127,5 ; la bougie 7 (h 122) ne l'atteint pas : la position reste ouverte
  const r = run({ edit15: (b) => { b[4] = bar(109, 122, 108, 117); } });
  assert.equal(r.trades.length, 0); assert.ok(r.open); assert.equal(r.open.tp, 127.5); assert.equal(r.open.entry, 107);
});

test('TP = moitié de la cible quand elle dépasse 3 R', () => {
  const { trades } = run({ edit15: (b) => { b[4] = bar(109, 122, 108, 117); b[7] = bar(108, 128, 107.5, 127); } });
  assert.equal(trades.length, 1); assert.equal(trades[0].tp, 127.5); assert.equal(trades[0].why, 'tp'); assert.ok(Math.abs(trades[0].r - (127.5 - 107) / 4.5) < 1e-9);
});

test('ordre actif 12 bougies : rempli à la 12e (bougie 17), pas à la 13e (bougie 18)', () => {
  const at = (i) => ({ edit15: (b) => { quiet(b); b[i] = bar(118, 119, 106, 108); b[i + 1] = bar(108, 125, 107.5, 121); } });
  const ok = run(at(17)), no = run(at(18));
  assert.equal(ok.trades.length, 1); assert.equal(ok.trades[0].fillIdx, 17);
  assert.equal(no.trades.length, 0);
});

test('TP touché avant le remplissage : ordre annulé, pas de trade', () => {
  const { trades } = run({ edit15: (b) => { b[6] = bar(119, 125, 115, 124); } });
  assert.equal(trades.length, 0);
});

test('spread : remplissage seulement si low + spread <= entrée', () => {
  assert.equal(run({}, { spread: 1 }).trades.length, 0); // 106,5 + 1 = 107,5 > 107
  assert.equal(run({}, { spread: 0.4 }).trades.length, 1);
});

test('balayage H4 refusé ou placement hors plage horaire : aucun ordre', () => {
  assert.equal(run({}, { sweep: () => false }).trades.length, 0);
  assert.equal(run({ start: Date.UTC(2014, 0, 15, 20, 0) }).trades.length, 0); // bougie 5 à 16:15 NY
});

test('un seul ordre par OB : un second FVG M15 qui partage le même OB est ignoré', () => {
  // la bougie 6 forme un second FVG M15 haussier (c1 = 4 haussière) dont l'OB serait encore la bougie 3
  const { stages } = run({ edit15: (b) => { b[6] = bar(119, 125, 119.5, 124); } });
  assert.equal(stages.filter((s) => s === 'fvg_sweep').length, 2); assert.equal(stages.filter((s) => s === 'ob').length, 1); assert.equal(stages.filter((s) => s === 'order').length, 1);
});

test('bullFvgM5 et toBars', () => {
  const c5 = [{ h: 106, l: 103, raw: 0 }, { h: 110, l: 105, raw: 300000 }, { h: 113, l: 108, raw: 600000 }];
  assert.deepEqual(bullFvgM5(c5), [{ lo: 106, hi: 108, doneMs: 900000, idx: 2 }]);
  const rows = [[0, 1, 2, 0.5, 1.5], [60000, 1.5, 3, 1, 2], [300000, 2, 2.5, 1.8, 2.2]];
  const b = toBars(rows, 300000); assert.equal(b.length, 2); assert.deepEqual([b[0].o, b[0].h, b[0].l, b[0].c, b[0].raw], [1, 3, 0.5, 2, 0]);
});

test('judgeOB : critères', () => {
  const mk = (rs2, y) => rs2.map((r, i) => ({ key: `${y}-${i}`, r, why: r > 0 ? 'tp' : 'stop', year: y }));
  const ctrlT = mk([1, -1, -1, 1], 2011);
  const good = { 2011: { trades: mk([2, 2, -1, 2, 2, 2, 2, 2, 2, 2], 2011) }, 2017: { trades: mk([2, 2, -1, 2, 2, 2, 2, 2, 2, 2], 2017) } };
  const j = judgeOB(good, ctrlT, 1.5); assert.equal(j.pass, true);
  assert.equal(judgeOB(good, ctrlT, 0.5).c.rate, false);
  assert.equal(judgeOB({ 2011: good[2011], 2017: { trades: mk([-1, -1, 1], 2017) } }, ctrlT, 2).c.halves, false);
});

test('série trop courte : null', () => {
  const c = Array.from({ length: 50 }, (_, i) => ({ t: 1.2e9 + i * 900, raw: Date.UTC(2015, 0, 1) + i * 900000, o: 1, h: 2, l: 0.5, c: 1.5 }));
  assert.equal(runYearOBRaw(c, [], 2015), null);
});
