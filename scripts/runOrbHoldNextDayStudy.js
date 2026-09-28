#!/usr/bin/env node
// runOrbHoldNextDayStudy.js - test pré-enregistré dans data/backtest-input/preregistration-orb-hold-next-day-2026-09-25.md.
// Usage : node --max-old-space-size=6144 scripts/runOrbHoldNextDayStudy.js   -> data/backtest-input/orb-hold-next-day-study.md
import fs from 'node:fs';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { OFF, readCsvGz, refPrice, swapPerUnit } from './lib/m1Data.js';
import { buildSessions } from './lib/intradayMomentum.js';
import { orbHoldNextDay } from './lib/orbHold.js';

const Y = (y) => Date.UTC(y, 0, 1);
const SYM = 'US100';
const ref = refPrice(SYM);
const spreadAt = (p) => (DEFAULT_SPREADS[SYM] ?? 0) * p / ref;
const swapAt = (a, b, fill, long) => swapPerUnit(SYM, long ? 'bullish' : 'bearish', a - OFF, b - OFF) * (fill / ref);
const rows = [];
for (const [file, keep] of [[`data/histdata-m1/${SYM}.csv.gz`, (u) => u < Y(2023)], [`data/real-m1-full/${SYM}.csv.gz`, (u) => u >= Y(2023)]]) {
  const raw = readCsvGz(file);
  const S = { ...raw, t: raw.t.map((x) => x + OFF) }; // retour en UTC
  const days = buildSessions(S);
  for (let i = 0; i < days.length; i++) {
    const r = orbHoldNextDay(days[i], days[i + 1] ?? null, S, spreadAt, swapAt);
    if (r && keep(r.base.entryTime)) rows.push(r);
  }
}
const P = [['Entraînement 2011-2022', Y(2010), Y(2023)], ['  2011-2016', Y(2010), Y(2017)], ['  2017-2022', Y(2017), Y(2023)], ['Test 2023-2025', Y(2023), Y(2026)], ['2026 (→ 21/09)', Y(2026), Y(2027)]];
const sum = (l, k) => l.reduce((a, x) => a + x[k].r, 0);
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const win = (l, k) => (l.length ? 100 * l.filter((x) => x[k].r > 0).length / l.length : 0).toFixed(0);
const md = ['# A (ORB 5 min, US100) gardée jusqu\'à la clôture du lendemain — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-orb-hold-next-day-2026-09-25.md` (commité avant ce calcul). Code : `scripts/lib/orbHold.js` (testé), `scripts/runOrbHoldNextDayStudy.js`. Mêmes entrées pour les deux colonnes.', '',
  '| Période | Trades | A actuelle (15:59) | Gagnants | A gardée jusqu\'au lendemain | Gagnants | Écart |', '|---|---|---|---|---|---|---|'];
const per = {};
for (const [lab, a, b] of P) {
  const l = rows.filter((x) => x.base.entryTime >= a && x.base.entryTime < b);
  const rb = sum(l, 'base'), rh = sum(l, 'hold'); per[lab.trim()] = { rb, rh };
  md.push(`| ${lab.trim()} | ${l.length} | ${sgn(rb)} R | ${win(l, 'base')} % | ${sgn(rh)} R | ${win(l, 'hold')} % | ${sgn(rh - rb)} R |`);
}
const held = rows.filter((x) => x.base.reason === 'close');
md.push('', `Trades encore ouverts à 15:59 (les seuls que la variante change) : ${held.length} sur ${rows.length} ; sorties de la variante pour eux : ${['close2', 'target', 'stop'].map((r) => `${r} ${held.filter((x) => x.hold.reason === r).length}`).join(', ')}.`);
const tr = per['Entraînement 2011-2022'], h1 = per['2011-2016'], h2 = per['2017-2022'], te = per['Test 2023-2025'];
const ok1 = tr.rh > tr.rb && h1.rh - h1.rb > 0 && h2.rh - h2.rb > 0;
const verdict = !ok1 ? '**NON RETENUE** (ne bat pas la référence à l\'entraînement, ou pas sur les deux moitiés)' : te.rh >= te.rb ? '**RETENUE** (mieux à l\'entraînement sur les deux moitiés, pas moins bien au test) - décision d\'Esdras avant tout changement en réel' : '**NON RETENUE** (moins bien au test)';
md.push('', '## Verdict (critère pré-enregistré)', '', verdict, '', '## Limites', '', '- HistData ≠ prix du broker ; spread par défaut ; swap du courtier ; la nuit, le spread réel est souvent plus large que le spread par défaut (non modélisé).');
fs.writeFileSync('data/backtest-input/orb-hold-next-day-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
