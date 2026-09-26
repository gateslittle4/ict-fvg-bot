#!/usr/bin/env node
// runStopOrderEntryStudy.js - test pré-enregistré dans docs/PREREG_STOP_ORDER.md (idée de Gemini, 2026-09-26) : entrée FVG par ordre
// STOP à l'extrême de la zone + 1 tick, comparée au premier contact et à l'ordre LIMIT. Règles d'ordre dans src/execution/entryPolicy.js
// (stopEntryOrder, targetFromFill, orderProtection), exécutions dans scripts/lib/stopOrderEntry.js (testées).
// Usage : node --max-old-space-size=6144 scripts/runStopOrderEntryStudy.js [--dry]
//   --dry : génère seulement les signaux et affiche leur nombre (vérification technique, aucun résultat).
//   -> data/backtest-input/stop-order-entry-study.md
import fs from 'node:fs';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { toRealNyHourMinute } from '../src/backtest/nySession.js';
import { CONFIG } from '../src/config.js';
import { OFF, eng, loadM1, toM15, refPrice, swapPerUnit } from './lib/m1Data.js';
import { firstContact, limitEntry, stopEntry } from './lib/stopOrderEntry.js';

const DRY = process.argv.includes('--dry');
const SYMS = ['US100', 'US500'];
const MIN = 60000;
const TICK = 0.01;
const PERIODS = [
  { id: 'train', label: 'Train 2010-2022', from: eng(2010), to: eng(2023) },
  { id: 'h1', label: '  dont 2010-2016', from: eng(2010), to: eng(2017) },
  { id: 'h2', label: '  dont 2017-2022', from: eng(2017), to: eng(2023) },
  { id: 'test', label: 'Test 2023-2025', from: eng(2023), to: eng(2026) },
  { id: 'fwd', label: 'Forward 2026', from: eng(2026), to: eng(2027) },
];
const NONE = { divergenceConfig: null, nwogConfig: null, judasSwingConfig: null, weeklySweepConfig: null, breakerBlockConfig: null, silverBulletConfig: null, cbdrConfig: null };

/** Signaux FVG validés (non bloqués) du moteur live sur une série, comme l'étude LIVE_FILL de runCleanStudy.js. */
function fvgSignals(sym, m15) {
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(10000, m15[0].time);
  const engine = new LiveStrategyEngine({ symbols: [sym], fvgConfig: { [sym]: CONFIG.fvg.perSymbol[sym] }, ...NONE, guardrail, riskPctPerTrade: 0.5, spreads: DEFAULT_SPREADS });
  const out = [];
  engine.warmUp({ [sym]: m15 }, {
    onEvent: (s, candle) => {
      if (s.type !== 'validated' || s.blockedReason || s.source !== 'fvg') return;
      out.push({ symbol: sym, direction: s.direction, zone: s.zone, entryPrice: s.entryPrice, stopPrice: s.stopPrice, targetPrice: s.targetPrice, rrMultiple: s.rrMultiple, distance: s.distance, time: candle.time });
    },
  });
  return out;
}

/** 16 h 00 New York le jour du signal (temps moteur). */
function sessionEndOf(t) {
  const { hour, minute } = toRealNyHourMinute(t);
  return t + Math.max(0, 16 * 60 - (hour * 60 + minute)) * MIN;
}

const rows = []; // { symbol, period ids, sig, first, limit, stop }
const t0 = Date.now();
for (const sym of SYMS) {
  for (const [src, keep] of [['hist', (t) => t < eng(2023)], ['broker', (t) => t >= eng(2023)]]) {
    const S = loadM1(src, sym);
    const sigs = fvgSignals(sym, toM15(S)).filter((s) => keep(s.time));
    console.log(`${sym} ${src} : ${sigs.length} signaux (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    if (DRY) continue;
    const swapFor = (dir, from, to, fill) => swapPerUnit(sym, dir, from, to) * (fill / refPrice(sym));
    for (const sig of sigs) {
      const spread = (DEFAULT_SPREADS[sym] ?? 0) * (sig.entryPrice / refPrice(sym));
      const opts = { spread, swap: swapFor };
      rows.push({
        symbol: sym, time: sig.time,
        first: firstContact(S, sig, opts),
        limit: limitEntry(S, sig, { ...opts, maxAgeCandles: CONFIG.fvg.maxAgeCandles }),
        stop: stopEntry(S, sig, { ...opts, tick: TICK, sessionEnd: sessionEndOf(sig.time) }),
      });
    }
  }
}
if (DRY) process.exit(0);

const st = (l) => {
  const n = l.length, s = l.reduce((a, x) => a + x.r, 0), m = n ? s / n : 0;
  const sd = n > 1 ? Math.sqrt(l.reduce((a, x) => a + (x.r - m) ** 2, 0) / (n - 1)) : 0;
  return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? l.filter((x) => x.r > 0).length / n : 0 };
};
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const EXEC = [['first', 'Premier contact (référence, non exécutable)'], ['limit', 'Limite (le bot jusqu\'au 23/09)'], ['stop', 'Stop (hypothèse)']];
const inP = (p) => (r) => r.time >= p.from && r.time < p.to;
const md = ['# Entrée FVG par ordre stop — résultat du pré-enregistrement', '',
  `Règles : \`docs/PREREG_STOP_ORDER.md\` (commité avant ce calcul). Script : \`scripts/runStopOrderEntryStudy.js\`. R net de spread et de swap (commission 0), rapporté au risque réel |exécution − stop|. Généré le ${new Date().toISOString().slice(0, 16)} UTC.`, ''];
const res = {};
for (const scope of [['US100 + US500', SYMS], ['US100', ['US100']], ['US500', ['US500']]]) {
  md.push(`## ${scope[0]}`, '', '| Période | Signaux | Exécution | Trades | Gagnants | R moyen | R total | t |', '|---|---|---|---|---|---|---|---|');
  for (const p of PERIODS) {
    const R = rows.filter((r) => scope[1].includes(r.symbol) && inP(p)(r));
    for (const [k, lab] of EXEC) {
      const s = st(R.map((r) => r[k]).filter((x) => x.r !== undefined));
      if (scope[0] === 'US100 + US500') res[`${k}-${p.id}`] = s;
      md.push(`| ${p.label} | ${R.length} | ${lab} | ${s.n} | ${Math.round(100 * s.win)} % | ${sgn(s.m, 3)} | ${sgn(s.s)} | ${s.t.toFixed(2)} |`);
    }
  }
  md.push('');
}
// Les trades US100 2023-2025 jamais repris par l'ordre LIMIT (204 dans l'étude du 23/09) : combien l'ordre stop récupère-t-il ?
const never = rows.filter((r) => r.symbol === 'US100' && inP(PERIODS[3])(r) && r.limit.missed);
const got = never.filter((r) => r.stop.r !== undefined);
const why = (k) => never.filter((r) => r.limit.missed === k).length;
md.push('## Les trades US100 2023-2025 jamais repris par l\'ordre limite', '',
  `- Recomptés avec ce code : **${never.length}** (204 dans l'étude du 23/09) — objectif atteint avant le retour : ${why('target-first')}, ordre expiré : ${why('expired')}.`,
  `- Premier contact sur ces signaux : ${sgn(st(never.map((r) => r.first).filter((x) => x.r !== undefined)).s)} R.`,
  `- **Récupérés par l'ordre stop : ${got.length}** sur ${never.length}, pour ${sgn(st(got.map((r) => r.stop)).s)} R (R moyen ${sgn(st(got.map((r) => r.stop)).m, 3)}).`, '');
// Verdict (précision 7) : exécution STOP, US100 + US500 réunis.
const tr = res['stop-train'], te = res['stop-test'];
let verdict;
if (tr.n < 10 || te.n < 10) verdict = `**PAS ASSEZ** (${tr.n} trades en train, ${te.n} en test)`;
else if (te.m <= 0) verdict = `**REJETÉ** (espérance test ${sgn(te.m, 3)} R)`;
else if (tr.m > 0 && te.m >= 0.3 * tr.m) verdict = `**ÇA TIENT** (train ${sgn(tr.m, 3)} R, test ${sgn(te.m, 3)} R ≥ 30 % du train)`;
else verdict = `**NE TIENT PAS** (train ${sgn(tr.m, 3)} R, test ${sgn(te.m, 3)} R : cas non couvert par le verdict, précision 7)`;
md.push('## Verdict (fixé à l\'avance, exécution stop, US100 + US500)', '', verdict, '');
fs.writeFileSync('data/backtest-input/stop-order-entry-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
