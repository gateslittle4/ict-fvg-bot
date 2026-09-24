#!/usr/bin/env node
// runPortfolioFtmoStudy.js
// Usage : node --max-old-space-size=6144 scripts/runPortfolioFtmoStudy.js   (data/live-replay/*.json + data/histdata-m1)
//
// DESCRIPTIF (demande d'Esdras, après runRiskBrakeFtmoStudy.js) : mêmes configurations de risque et même simulation FTMO 1-Step,
// pour (1) combo live + A (ORB US100) + B (noise area US500) sur un même compte, (2) A + B seuls. Une position par paire.
// A : risque X % (levier plafonné à 4x) ; B : cible de volatilité journalière X % (nominal = capital x min(4, X / sigma14)).
// Rapport : data/backtest-input/portfolio-ftmo-study.md.
import fs from 'node:fs';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { buildSessions, orbTrade, noiseTrades, dailyVol } from './lib/intradayMomentum.js';
import { OFF, refPrice } from './lib/m1Data.js';

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

/** Trades A ou B avec leur rendement par unité de risque : f(riskPct) = part du solde gagnée/perdue. */
function momentum(sym, strat) {
  const ref = refPrice(sym), spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * p / ref;
  const out = [];
  for (const [file, keep] of [[`data/histdata-m1/${sym}.csv.gz`, (d) => d.dayNum * 86400000 < Y(2023)], [`data/real-m1-full/${sym}.csv.gz`, (d) => d.dayNum * 86400000 >= Y(2023)]]) {
    const days = buildSessions(readGz(file));
    for (let i = 0; i < days.length; i++) {
      if (!keep(days[i])) continue;
      if (strat === 'orb') { const a = orbTrade(days[i], spreadAt); if (a) out.push({ symbol: sym, entry: a.entryTime, exit: a.exitTime, f: (x) => Math.min(x / 100, 4 * a.R / a.fill) * a.r }); }
      else { const vol = dailyVol(days, i); if (!(vol > 0)) continue; for (const b of noiseTrades(days, i, spreadAt)) out.push({ symbol: sym, entry: b.entryTime, exit: b.exitTime, f: (x) => Math.min(4, (x / 100) / vol) * b.ret }); }
    }
  }
  return out;
}

const START = 10000;
const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['train', 'Entraînement 2010-2022', Y(2010), Y(2023)], ['test', 'Test 2023-2025', Y(2023), Y(2026)], ['fwd', '2026 (→ 21 sept.)', Y(2026), Y(2027)]];
const CONFIGS = [
  ...[0.25, 0.3, 0.5, 0.75, 1].map((r) => ({ id: `fixe ${r} %`, base: r, brakeAt: null })),
  ...[[0.5, 4], [0.5, 5], [0.75, 4], [0.75, 5]].map(([r, d]) => ({ id: `frein ${r} % → ${r / 2} % à −${d} %`, base: r, brakeAt: d })),
];

function run(trades, cfg) {
  const evs = [];
  trades.forEach((t, i) => { evs.push({ time: t.entry, kind: 1, i }); evs.push({ time: Math.max(t.exit, t.entry), kind: 0, i }); });
  evs.sort((a, b) => a.time - b.time || b.kind - a.kind);
  const guard = buildEffectiveConfig({ id: 'brake', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: cfg.base }).guardrails;
  const cycles = []; let c = null; const busy = new Map();
  const start = (time) => { const g = new GuardrailEngine({ ...guard }); g.setBalance(START, time); c = { start: time, g, bal: START, peak: START, open: new Map(), n: 0 }; };
  start(evs.length ? evs[0].time : 0);
  for (const ev of evs) {
    const t = trades[ev.i];
    if (ev.kind === 1) {
      if (t.entry < c.start || busy.get(t.symbol) || !c.g.canTakeNewTrade(t.entry, t.symbol)) continue;
      const dd = (c.peak - c.bal) / c.peak * 100;
      const risk = cfg.brakeAt !== null && dd >= cfg.brakeAt ? cfg.base / 2 : cfg.base;
      c.open.set(ev.i, c.bal * t.f(risk)); busy.set(t.symbol, true);
      continue;
    }
    if (!c.open.has(ev.i)) continue;
    const pnl = c.open.get(ev.i); c.open.delete(ev.i); busy.set(t.symbol, false);
    c.bal += pnl; c.n++; c.peak = Math.max(c.peak, c.bal);
    c.g.recordTrade({ pnl, time: t.exit, balanceAfter: c.bal, symbol: t.symbol });
    const st = c.g.getStatus(t.exit, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) { cycles.push({ start: c.start, end: t.exit, out: st.targetReached ? 'ok' : 'ko' }); for (const k of c.open.keys()) busy.set(trades[k].symbol, false); start(t.exit); }
  }
  const ok = cycles.filter((x) => x.out === 'ok'), ko = cycles.filter((x) => x.out === 'ko');
  const days = ok.map((x) => (x.end - x.start) / 86400000).sort((a, b) => a - b);
  return { ok: ok.length, ko: ko.length, med: days.length ? days[days.length >> 1] : null, cur: (c.bal - START) / START * 100 };
}

function main() {
  const combo = fs.readdirSync('data/live-replay').flatMap((f) => JSON.parse(fs.readFileSync(`data/live-replay/${f}`, 'utf8')).trades)
    .map((t) => ({ symbol: t.symbol, entry: t.entryTime + OFF, exit: t.exitTime + OFF, f: (x) => x / 100 * t.r }));
  const A = momentum('US100', 'orb'), B = momentum('US500', 'noise');
  const sets = [['Combo + A + B (même compte)', [...combo, ...A, ...B]], ['A + B seuls', [...A, ...B]], ['Combo seul (rappel, avec position unique par paire)', combo]];
  const md = ['# Combo + A + B et A + B seuls, challenges FTMO 1-Step (descriptif)', '',
    'Même simulation et mêmes configurations que `risk-brake-ftmo-study.md` (pré-enregistré pour le combo seul). **Descriptif** : demandé après ce résultat, rien n\'est choisi ici. Script : `scripts/runPortfolioFtmoStudy.js`. A : risque X % par trade (levier ≤ 4x) ; B : cible de volatilité X % par jour ; combo : risque X % par trade. Une seule position par paire, garde-fou FTMO du projet, cycles enchaînés.', ''];
  for (const [name, list] of sets) {
    const all = list.slice().sort((a, b) => a.entry - b.entry);
    md.push(`## ${name}`, '', '| Configuration | 2010-2022 : réussis / ratés (réussis − ratés) | Durée médiane d\'un réussi | 2023-2025 : réussis / ratés | 2026 : réussis / ratés (cycle en cours) |', '|---|---|---|---|---|');
    for (const cfg of CONFIGS) {
      const r = PERIODS.map(([, , a, b]) => run(all.filter((t) => t.entry >= a && t.entry < b), cfg));
      md.push(`| ${cfg.id} | ${r[0].ok} / ${r[0].ko} (${r[0].ok - r[0].ko >= 0 ? '+' : ''}${r[0].ok - r[0].ko}) | ${r[0].med !== null ? Math.round(r[0].med) + ' j' : '—'} | ${r[1].ok} / ${r[1].ko} | ${r[2].ok} / ${r[2].ko} (${r[2].cur >= 0 ? '+' : ''}${r[2].cur.toFixed(1)} %) |`);
    }
    md.push('');
    console.error(`${name} : fait`);
  }
  md.push('## Limites', '', '- Descriptif, demandé après le résultat du combo seul : aucune configuration n\'est choisie ici.', '- 1 réussi = 1 raté (coût d\'un échec non chiffré) ; trades du combo fixés par le rejeu (garde-fou à 0,3 %).', '- B : « X % » = cible de volatilité journalière (pas de stop), donc pas exactement le même risque qu\'un trade à X %.');
  fs.writeFileSync('data/backtest-input/portfolio-ftmo-study.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
