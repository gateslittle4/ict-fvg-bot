#!/usr/bin/env node
// runStreakBlockStudy.js
// Usage : node --max-old-space-size=6144 scripts/runStreakBlockStudy.js
//   (il faut data/live-replay/*.json, voir runLiveReplay.js, et data/histdata-m1 pour A/B)
//
// Idée d'Esdras : bloquer une jambe après K pertes consécutives, la suivre à blanc, la réactiver au premier gain virtuel -
// EXACTEMENT telle que pré-enregistrée dans data/backtest-input/preregistration-streak-block-2026-09-24.md (commité AVANT ce script).
// Rapport : data/backtest-input/streak-block-study.md.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { buildSessions, orbTrade, noiseTrades } from './lib/intradayMomentum.js';
import { OFF, refPrice } from './lib/m1Data.js';

const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['train', 'Entraînement 2010-2022', Y(2010), Y(2023)], ['test', 'Test 2023-2025', Y(2023), Y(2026)], ['fwd', '2026 (→ fin des données)', Y(2026), Y(2027)]];
const HALVES = [['2010-2016', Y(2010), Y(2017)], ['2017-2022', Y(2017), Y(2023)]];

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

function momentumLeg(sym, strat) {
  const ref = refPrice(sym), spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * p / ref;
  const out = [];
  for (const [file, keep] of [[`data/histdata-m1/${sym}.csv.gz`, (d) => d.dayNum * 86400000 < Y(2023)], [`data/real-m1-full/${sym}.csv.gz`, (d) => d.dayNum * 86400000 >= Y(2023)]]) {
    const days = buildSessions(readGz(file));
    for (let i = 0; i < days.length; i++) {
      if (!keep(days[i])) continue;
      if (strat === 'orb') { const a = orbTrade(days[i], spreadAt); if (a) out.push({ t: a.entryTime, v: a.r }); }
      else for (const b of noiseTrades(days, i, spreadAt)) out.push({ t: b.entryTime, v: b.ret * 100 });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Applique la règle à une jambe : chaque trade marqué pris / sauté. */
function applyRule(trades, K) {
  let blocked = false, losses = 0, prev = [];
  return trades.map((tr) => {
    const after3 = prev.length >= 3 && prev.slice(-3).every((x) => x < 0); // contrôle : 3 pertes réelles de la jambe juste avant
    prev.push(tr.v);
    if (!blocked) {
      if (tr.v < 0) { losses++; if (losses >= K) blocked = true; } else losses = 0;
      return { ...tr, taken: true, after3 };
    }
    if (tr.v > 0) { blocked = false; losses = 0; }
    return { ...tr, taken: false, after3 };
  });
}

const mv = (l) => { const n = l.length, s = l.reduce((a, x) => a + x, 0), m = n ? s / n : 0; const v = n > 1 ? l.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1) : 0; return { n, s, m, v }; };
const welch = (a, b) => { const d = a.m - b.m, se = Math.sqrt((a.n > 1 ? a.v / a.n : 0) + (b.n > 1 ? b.v / b.n : 0)); return { d, t: se ? d / se : 0 }; };
const sgn = (x, d = 3) => (x >= 0 ? '+' : '') + x.toFixed(d);

function main() {
  const combo = {};
  for (const f of fs.readdirSync('data/live-replay')) for (const t of JSON.parse(fs.readFileSync(`data/live-replay/${f}`, 'utf8')).trades) {
    (combo[`${t.source} ${t.symbol}`] ??= []).push({ t: t.entryTime + OFF, v: t.r });
  }
  const legsR = Object.fromEntries(Object.entries(combo).map(([k, l]) => [k, l.sort((a, b) => a.t - b.t)]));
  legsR['A (ORB) US100'] = momentumLeg('US100', 'orb');
  const legB = momentumLeg('US500', 'noise');

  const md = ['# Bloquer une stratégie après une série de pertes, la réactiver après un gain virtuel — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-streak-block-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runStreakBlockStudy.js`. Par jambe : 3 pertes consécutives prises → bloquée ; trades suivis à blanc ; premier gagnant virtuel → réactivée. Jambes en R : combo live (rejeu fidèle 2010-2026) + A ; B (en %) à part.', ''];
  const inP = (a, b) => (x) => x.t >= a && x.t < b;
  for (const K of [3, 2, 4]) {
    const all = Object.entries(legsR).flatMap(([leg, l]) => applyRule(l, K).map((x) => ({ ...x, leg })));
    const cmp = (L) => ({ taken: mv(L.filter((x) => x.taken).map((x) => x.v)), skipped: mv(L.filter((x) => !x.taken).map((x) => x.v)), all: mv(L.map((x) => x.v)) });
    const tr = cmp(all.filter(inP(PERIODS[0][2], PERIODS[0][3]))), w = welch(tr.taken, tr.skipped);
    const hs = HALVES.map(([, a, b]) => { const c = cmp(all.filter(inP(a, b))); return welch(c.taken, c.skipped).d; });
    const te = cmp(all.filter(inP(PERIODS[1][2], PERIODS[1][3]))), wt = welch(te.taken, te.skipped);
    const ok = w.d > 0 && w.t >= 2 && hs.every((x) => x > 0);
    const verdict = K !== 3 ? '(sensibilité, jamais retenue)' : !ok ? '**INUTILE à l\'entraînement**' : wt.d > 0 ? '**UTILE** (démo d\'abord)' : '**INUTILE au test**';
    md.push(`## K = ${K} ${K === 3 ? '(règle pré-enregistrée)' : '(sensibilité)'}`, '',
      `- Entraînement : trades pris ${tr.taken.n} (moyenne ${sgn(tr.taken.m)} R), sautés ${tr.skipped.n} (moyenne ${sgn(tr.skipped.m)} R) → écart pris − sautés ${sgn(w.d)} R, **t = ${w.t.toFixed(2)}** ; 2010-2016 ${sgn(hs[0])}, 2017-2022 ${sgn(hs[1])}.`,
      `- Test 2023-2025 : pris ${te.taken.n} (${sgn(te.taken.m)} R), sautés ${te.skipped.n} (${sgn(te.skipped.m)} R) → écart ${sgn(wt.d)} R (t ${wt.t.toFixed(2)}).`,
      `- Verdict : ${verdict}`, '', '| Période | R total sans règle | R total avec règle | R évité (trades sautés) |', '|---|---|---|---|');
    for (const [, lab, a, b] of PERIODS) { const c = cmp(all.filter(inP(a, b))); md.push(`| ${lab} | ${sgn(c.all.s, 1)} | ${sgn(c.taken.s, 1)} | ${sgn(-c.skipped.s, 1)} |`); }
    if (K === 3) {
      md.push('', '### Par jambe, entraînement (R moyen des pris / des sautés)', '', '| Jambe | Pris | Sautés |', '|---|---|---|');
      for (const leg of Object.keys(legsR)) { const c = cmp(all.filter((x) => x.leg === leg).filter(inP(PERIODS[0][2], PERIODS[0][3]))); md.push(`| ${leg} | ${sgn(c.taken.m)} (${c.taken.n}) | ${sgn(c.skipped.m)} (${c.skipped.n}) |`); }
      const tr3 = all.filter(inP(PERIODS[0][2], PERIODS[0][3]));
      const a3 = mv(tr3.filter((x) => x.after3).map((x) => x.v)), allm = mv(tr3.map((x) => x.v));
      md.push('', `Contrôle direct (entraînement) : trade qui suit 3 pertes de suite de la même jambe ${sgn(a3.m)} R (${a3.n}) contre ${sgn(allm.m)} R pour tous les trades.`);
    }
    md.push('');
  }
  const b = applyRule(legB, 3);
  md.push('## B (noise area US500, en % du nominal, descriptif, K = 3)', '', '| Période | Pris (n, moyenne) | Sautés (n, moyenne) | Total sans / avec règle |', '|---|---|---|---|');
  for (const [, lab, a, z] of PERIODS) { const L = b.filter(inP(a, z)); const tk = mv(L.filter((x) => x.taken).map((x) => x.v)), sk = mv(L.filter((x) => !x.taken).map((x) => x.v)); md.push(`| ${lab} | ${tk.n}, ${sgn(tk.m)} % | ${sk.n}, ${sgn(sk.m)} % | ${sgn(tk.s + sk.s, 1)} % / ${sgn(tk.s, 1)} % |`); }
  md.push('', '## Limites', '', '- Rejeu fidèle du combo : ses trades ont déjà subi le garde-fou et la position unique par paire ; bloquer une jambe pourrait libérer des places pour d\'autres (non simulé).', '- Tranches du rejeu recollées (chaque tranche repart de 90 jours de préchauffage).');
  fs.writeFileSync('data/backtest-input/streak-block-study.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
