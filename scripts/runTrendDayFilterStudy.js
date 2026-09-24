#!/usr/bin/env node
// runTrendDayFilterStudy.js
// Usage : node --max-old-space-size=6144 scripts/runTrendDayFilterStudy.js      (il faut data/histdata-m1, voir buildHistdataM1.js)
//
// Filtre « journées de tendance » pour A (ORB 5 min US100) et B (noise area US500), EXACTEMENT tel que pré-enregistré dans
// data/backtest-input/preregistration-trend-day-filter-2026-09-24.md (commité AVANT ce script) : on ne trade que si la part de
// journées de tendance des 20 séances précédentes >= sa médiane des 250 séances précédentes. Trades A et B inchangés
// (scripts/lib/intradayMomentum.js, mêmes coûts que runIntradayMomentumStudy.js). Rapport : data/backtest-input/trend-day-filter-study.md.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { buildSessions, orbTrade, noiseTrades } from './lib/intradayMomentum.js';
import { refPrice } from './lib/m1Data.js';

const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['train', 'Entraînement 2010-2022', Y(2010), Y(2023)], ['test', 'Test 2023-2025', Y(2023), Y(2026)], ['fwd', '2026 (→ fin des données)', Y(2026), Y(2027)]];
const HALVES = [[Y(2010), Y(2017)], [Y(2017), Y(2023)]];
const LEGS = [{ id: 'A-US100', sym: 'US100', strat: 'orb', unit: 'R' }, { id: 'B-US500', sym: 'US500', strat: 'noise', unit: '%' }];
const RECENT = 20, BASE = 250;

function readGz(file) {
  const txt = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  const t = [], o = [], h = [], l = [], c = [];
  let pos = txt.indexOf('\n') + 1;
  while (pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const p = txt.slice(pos, end).split(','); pos = end + 1;
    if (p.length < 5) continue;
    t.push(+p[0]); o.push(+p[1]); h.push(+p[2]); l.push(+p[3]); c.push(+p[4]);
  }
  return { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length };
}

const isTrendDay = (d) => {
  let hi = -Infinity, lo = Infinity;
  for (let j = 0; j < d.h.length; j++) { if (d.h[j] > hi) hi = d.h[j]; if (d.l[j] < lo) lo = d.l[j]; }
  if (!(hi > lo)) return false;
  const pos = (d.close - lo) / (hi - lo);
  return (d.close > d.open && pos >= 0.8) || (d.close < d.open && pos <= 0.2);
};
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** date -> filtre actif (true/false) ; absent si pas assez d'historique. Séances : HistData puis broker à partir de son premier jour. */
function filterByDate(histDays, brokerDays) {
  const first = brokerDays[0].dayNum;
  const days = [...histDays.filter((d) => d.dayNum < first), ...brokerDays];
  const trend = days.map((d) => (isTrendDay(d) ? 1 : 0));
  const share = days.map((_, i) => (i >= RECENT ? trend.slice(i - RECENT, i).reduce((a, x) => a + x, 0) / RECENT : null));
  const out = new Map();
  for (let i = RECENT + BASE; i < days.length; i++) {
    const base = share.slice(i - BASE, i);
    out.set(days[i].date, share[i] >= median(base));
  }
  return out;
}

function trades(leg, days, keep) {
  const ref = refPrice(leg.sym), spreadAt = (p) => (DEFAULT_SPREADS[leg.sym] ?? 0) * p / ref;
  const out = [];
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (!keep(d)) continue;
    if (leg.strat === 'orb') { const a = orbTrade(d, spreadAt); if (a) out.push({ ...a, date: d.date, v: a.r }); }
    else for (const b of noiseTrades(days, i, spreadAt)) out.push({ ...b, date: d.date, v: b.ret * 100 });
  }
  return out;
}

const mv = (l) => { const n = l.length, s = l.reduce((a, x) => a + x, 0), m = n ? s / n : 0; const v = n > 1 ? l.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1) : 0; return { n, s, m, v, t: v ? m / Math.sqrt(v / n) : 0 }; };
const welch = (a, b) => { const d = a.m - b.m, se = Math.sqrt((a.n > 1 ? a.v / a.n : 0) + (b.n > 1 ? b.v / b.n : 0)); return { d, t: se ? d / se : 0 }; };
const sgn = (x, d = 3) => (x >= 0 ? '+' : '') + x.toFixed(d);

function main() {
  const md = ['# Filtre « journées de tendance » pour A et B — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-trend-day-filter-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runTrendDayFilterStudy.js`. Filtre actif si la part de journées de tendance des 20 séances précédentes ≥ sa médiane des 250 séances précédentes (historique HistData collé avant le premier jour du broker). A en R, B en % du nominal.', '',
    '## Critère pré-enregistré', '', '| Stratégie | Entraînement : actif (n, moyenne) / inactif (n, moyenne) | Écart, t | 2010-2016 | 2017-2022 | Trades gardés | Test 2023-2025 : écart | Verdict |', '|---|---|---|---|---|---|---|---|'];
  const detail = ['## Par période', '', '| Stratégie | Période | Sans filtre (n, total, moyenne) | Filtre actif (n, total, moyenne) | Filtre inactif (n, total, moyenne) |', '|---|---|---|---|---|'];
  for (const leg of LEGS) {
    const hist = buildSessions(readGz(`data/histdata-m1/${leg.sym}.csv.gz`)), broker = buildSessions(readGz(`data/real-m1-full/${leg.sym}.csv.gz`));
    const F = filterByDate(hist, broker);
    const T = [...trades(leg, hist, (d) => d.dayNum * 86400000 < Y(2023)), ...trades(leg, broker, (d) => d.dayNum * 86400000 >= Y(2023))]
      .filter((t) => F.has(t.date)).map((t) => ({ ...t, on: F.get(t.date) }));
    const inP = (a, b) => (t) => t.entryTime >= a && t.entryTime < b;
    const split = (L) => ({ all: mv(L.map((t) => t.v)), on: mv(L.filter((t) => t.on).map((t) => t.v)), off: mv(L.filter((t) => !t.on).map((t) => t.v)) });
    const tr = split(T.filter(inP(PERIODS[0][2], PERIODS[0][3]))), te = split(T.filter(inP(PERIODS[1][2], PERIODS[1][3])));
    const w = welch(tr.on, tr.off), wt = welch(te.on, te.off);
    const hs = HALVES.map(([a, b]) => { const s = split(T.filter(inP(a, b))); return welch(s.on, s.off).d; });
    const kept = tr.on.n / Math.max(1, tr.all.n);
    const ok = w.d > 0 && w.t >= 2 && hs.every((x) => x > 0) && kept >= 0.3;
    const verdict = !ok ? '**REJETÉ à l\'entraînement**' : wt.d > 0 ? '**RETENU** (démo avec A/B)' : '**REJETÉ au test**';
    md.push(`| ${leg.id} | ${tr.on.n}, ${sgn(tr.on.m)} ${leg.unit} / ${tr.off.n}, ${sgn(tr.off.m)} ${leg.unit} | ${sgn(w.d)}, t ${w.t.toFixed(2)} | ${sgn(hs[0])} | ${sgn(hs[1])} | ${(kept * 100).toFixed(0)} % | ${sgn(wt.d)} (t ${wt.t.toFixed(2)}) | ${verdict} |`);
    for (const [, lab, a, b] of PERIODS) {
      const s = split(T.filter(inP(a, b)));
      const c = (x) => `${x.n}, ${sgn(x.s, 1)} ${leg.unit}, ${sgn(x.m)}`;
      detail.push(`| ${leg.id} | ${lab} | ${c(s.all)} | ${c(s.on)} | ${c(s.off)} |`);
    }
  }
  md.push('', ...detail, '', '## Limites', '', '- Journées de tendance de 2022 calculées sur HistData pour amorcer le filtre au début du broker (2023).', '- Trades des jours sans décision possible (moins de 270 séances d\'historique) exclus des deux groupes.', '- Un seul seuil (médiane glissante), aucun autre essayé.');
  fs.writeFileSync('data/backtest-input/trend-day-filter-study.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
