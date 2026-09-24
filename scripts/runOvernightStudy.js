#!/usr/bin/env node
// runOvernightStudy.js
// Usage : node --max-old-space-size=6144 scripts/runOvernightStudy.js      (il faut data/histdata-m1, voir buildHistdataM1.js)
//
// Achat de nuit (clôture 15:59 NY -> ouverture 9:30 suivante) sur US100 / US500, EXACTEMENT tel que pré-enregistré dans
// data/backtest-input/preregistration-overnight-2026-09-24.md (commité AVANT ce script). Spread par défaut + swap réel du broker,
// en % du prix du moment. Entraînement 2010-2022 = HistData M1 ; test 2023-2025 et 2026 = M1 du broker.
// Rapport : data/backtest-input/overnight-study.md.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';
import { buildSessions, dailyVol } from './lib/intradayMomentum.js';
import { OFF, refPrice, swapPerUnit } from './lib/m1Data.js';

const SYMBOLS = ['US100', 'US500'];
const START = 10000;
const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [
  { id: 'train', label: 'Entraînement 2010-2022', from: Y(2010), to: Y(2023) },
  { id: 'test', label: 'Test 2023-2025', from: Y(2023), to: Y(2026) },
  { id: 'fwd', label: '2026 (→ fin des données)', from: Y(2026), to: Y(2027) },
];
const HALVES = [[Y(2010), Y(2017)], [Y(2017), Y(2023)]];

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

function loadSources(sym) {
  const f = `data/histdata-m1/${sym}.csv.gz`;
  if (!fs.existsSync(f)) { console.error(`${f} manquant : lancer d'abord scripts/buildHistdataM1.js (données HistData 2010-2022).`); process.exit(1); }
  return [
    { days: buildSessions(readGz(f)), keep: (d) => d.dayNum * 86400000 < Y(2023) },
    { days: buildSessions(readGz(`data/real-m1-full/${sym}.csv.gz`)), keep: (d) => d.dayNum * 86400000 >= Y(2023) },
  ];
}

/** Une nuit par séance : achat à la clôture (ask), vente à l'ouverture suivante (bid), swap du broker. Contrôles bruts à côté. */
function nights(sym, sources, spreadMult) {
  const ref = refPrice(sym);
  const out = [];
  for (const { days, keep } of sources) {
    for (let i = 0; i + 1 < days.length; i++) {
      const d = days[i], n = days[i + 1];
      if (!keep(d)) continue;
      if (n.dayNum - d.dayNum > 4) continue; // données manquantes
      const s = spreadMult * (DEFAULT_SPREADS[sym] ?? 0) * d.close / ref;
      const fill = d.close + s;
      const swap = swapPerUnit(sym, 'bullish', d.closeTime - OFF, n.t[0] - OFF) * (fill / ref);
      const ret = (n.open - fill + swap) / fill;
      const weekend = new Date(d.dayNum * 86400000).getUTCDay() === 5;
      out.push({ symbol: sym, entryTime: d.closeTime, exitTime: n.t[0], ret, weekend, vol: dailyVol(days, i),
        grossNight: n.open / d.close - 1, grossDay: n.close / n.open - 1, gross24: n.close / d.close - 1, year: d.date.slice(0, 4) });
    }
  }
  return out;
}

const stats = (vals) => { const n = vals.length, s = vals.reduce((a, x) => a + x, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(vals.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? vals.filter((x) => x > 0).length / n * 100 : 0 }; };
const pct = (x, d = 3) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + ' %';
const inP = (p) => (t) => t.entryTime >= p.from && t.entryTime < p.to;

/** Compte : nominal = capital x min(4, cible / sigma14), garde-fou du bot, FTMO 1-Step enchaîné si ftmo. */
function simulate(trades, target, ftmo) {
  const list = trades.filter((t) => t.vol > 0).map((t) => ({ t, f: Math.min(4, (target / 100) / t.vol) * t.ret }));
  const guard = ftmo ? buildEffectiveConfig({ id: 'overnight', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: 0.5 }).guardrails : CONFIG.guardrails;
  const cycles = []; let c = null;
  const start = (time) => { const g = new GuardrailEngine({ ...guard }); g.setBalance(START, time); c = { start: time, g, bal: START, peak: START, dd: 0 }; };
  start(list.length ? list[0].t.entryTime : 0);
  for (const { t, f } of list) {
    if (t.entryTime < c.start || !c.g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const pnl = c.bal * f;
    c.bal += pnl; c.peak = Math.max(c.peak, c.bal); c.dd = Math.max(c.dd, (c.peak - c.bal) / c.peak * 100);
    c.g.recordTrade({ pnl, time: t.exitTime, balanceAfter: c.bal, symbol: t.symbol });
    if (!ftmo) continue;
    const st = c.g.getStatus(t.exitTime, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) { cycles.push({ ...c, out: st.targetReached ? 'RÉUSSI' : 'RATÉ' }); start(t.exitTime); }
  }
  cycles.push({ ...c, out: 'en cours' });
  return { ret: (cycles[0].bal - START) / START * 100, dd: Math.max(...cycles.map((x) => x.dd)), pass: cycles.filter((x) => x.out === 'RÉUSSI').length, fail: cycles.filter((x) => x.out === 'RATÉ').length, cur: (c.bal - START) / START * 100 };
}

function main() {
  const md = ['# Achat de nuit (clôture → ouverture) sur US100 / US500 — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-overnight-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runOvernightStudy.js`. Achat à la clôture 15:59 NY (ask), vente à l\'ouverture 9:30 suivante (bid), tous les jours, spread par défaut + swap du broker en % du prix. Rendement net par trade en % du nominal.', ''];
  const crit = ['## Critère pré-enregistré', '', '| Indice | Entraînement : nuits, moyenne nette, t | 2010-2016 | 2017-2022 | Test 2023-2025 : nuits, moyenne | Verdict |', '|---|---|---|---|---|---|'];
  const detail = ['## Par période (moyenne par nuit, total, t) et contrôles bruts de dérive', '', '| Indice | Période | Nuits | Gagnantes | Nette | Total net | t | Nette à 2 × spread | Nette sans week-ends | Nuit brute | Séance brute | 24 h brut |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const years = ['## Par année (total net)', '', '| Année | US100 | US500 |', '|---|---|---|'];
  const acct = ['## Compte 10 000 $ et FTMO 1-Step (descriptif)', '', 'Nominal = capital × min(4, cible / σ14) ; garde-fou du bot.', '', '| Indice | Cible de vol. | Période | Compte continu | Pire baisse | FTMO réussis / ratés |', '|---|---|---|---|---|---|'];
  const byYear = {};
  for (const sym of SYMBOLS) {
    const src = loadSources(sym);
    const T = nights(sym, src, 1), T2 = nights(sym, src, 2);
    console.error(`${sym} : ${T.length} nuits`);
    const tr = stats(T.filter(inP(PERIODS[0])).map((t) => t.ret));
    const halves = HALVES.map(([a, b]) => stats(T.filter((t) => t.entryTime >= a && t.entryTime < b).map((t) => t.ret)));
    const te = stats(T.filter(inP(PERIODS[1])).map((t) => t.ret));
    const trainOk = tr.n >= 60 && tr.m > 0 && tr.t >= 2 && halves.every((h) => h.s > 0);
    const verdict = trainOk ? (te.n >= 30 && te.m > 0 ? '**CANDIDATE** (démo/alerte d\'abord)' : '**ÉCHEC au test**') : '**ÉCHEC à l\'entraînement**';
    crit.push(`| ${sym} | ${tr.n}, ${pct(tr.m)}, t ${tr.t.toFixed(2)} | ${pct(halves[0].s, 1)} | ${pct(halves[1].s, 1)} | ${te.n}, ${pct(te.m)} (total ${pct(te.s, 1)}) | ${verdict} |`);
    for (const p of PERIODS) {
      const L = T.filter(inP(p)), L2 = T2.filter(inP(p));
      const s = stats(L.map((t) => t.ret)), s2 = stats(L2.map((t) => t.ret)), nw = stats(L.filter((t) => !t.weekend).map((t) => t.ret));
      const gN = stats(L.map((t) => t.grossNight)), gD = stats(L.map((t) => t.grossDay)), g24 = stats(L.map((t) => t.gross24));
      detail.push(`| ${sym} | ${p.label} | ${s.n} | ${s.win.toFixed(0)} % | ${pct(s.m)} | ${pct(s.s, 1)} | ${s.t.toFixed(2)} | ${pct(s2.m)} (t ${s2.t.toFixed(2)}) | ${pct(nw.m)} (t ${nw.t.toFixed(2)}) | ${pct(gN.m)} | ${pct(gD.m)} | ${pct(g24.m)} |`);
      for (const target of [0.5, 1]) {
        const r = simulate(L, target, false), f = simulate(L, target, true);
        acct.push(`| ${sym} | ${target} % | ${p.label} | ${r.ret >= 0 ? '+' : ''}${r.ret.toFixed(1)} % | ${r.dd.toFixed(1)} % | ${f.pass} / ${f.fail} (en cours ${f.cur >= 0 ? '+' : ''}${f.cur.toFixed(1)} %) |`);
      }
    }
    for (const t of T) { (byYear[t.year] ??= {})[sym] = (byYear[t.year]?.[sym] ?? 0) + t.ret; }
  }
  for (const [y, v] of Object.entries(byYear).sort()) years.push(`| ${y} | ${pct(v.US100 ?? 0, 1)} | ${pct(v.US500 ?? 0, 1)} |`);
  md.push(...crit, '', ...detail, '', 'Contrôles bruts (sans coûts) : « Nuit brute » = clôture → ouverture ; « Séance brute » = ouverture → clôture du lendemain ; « 24 h brut » = clôture → clôture. Si la nuit ne rapporte pas plus que sa part des 24 h, l\'achat de nuit ne fait que suivre la hausse générale.', '',
    ...years, '', ...acct, '', '## Limites', '', '- Swap relevé en 2026 appliqué à tout le passé (taux proches de 0 en 2010-2015 et 2020-2021 : coût réel plus faible alors).', '- Spread d\'ouverture à 9:30 souvent plus large que le spread par défaut (voir la colonne 2 × spread).', '- HistData ≠ prix du broker ; CFD ≠ actions ; 2 indices très corrélés.');
  const out = 'data/backtest-input/overnight-study.md';
  fs.writeFileSync(out, md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
