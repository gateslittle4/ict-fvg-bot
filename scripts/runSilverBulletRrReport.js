#!/usr/bin/env node
// runSilverBulletRrReport.js - applique la règle de data/backtest-input/preregistration-silverbullet-rr-2026-09-24.md aux rejeux
// fidèles `SB_RR=<n> node scripts/runLiveReplay.js <hist|broker> 0.3 <début> <fin>` (fichiers data/live-replay/*-sbrr<n>.json).
// Usage : node scripts/runSilverBulletRrReport.js   -> data/backtest-input/silverbullet-rr-study.md
import fs from 'node:fs';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';
import { OFF, eng } from './lib/m1Data.js';

const RRS = [2, 3, 4, 5, 6, 7];
const TRANCHES = ['hist-2010-2014', 'hist-2014-2017', 'hist-2017-2020', 'hist-2020-2023', 'broker-2023-2024', 'broker-2024-2025', 'broker-2025-2026', 'broker-2026-2027'];
const PERIODS = [
  { id: 'train', label: 'Entraînement 2010-2022', from: eng(2010), to: eng(2023) },
  { id: 'h1', label: '  2010-2016', from: eng(2010), to: eng(2017) },
  { id: 'h2', label: '  2017-2022', from: eng(2017), to: eng(2023) },
  { id: 'test', label: 'Test 2023-2025', from: eng(2023), to: eng(2026) },
  { id: 'fwd', label: '2026 (→ 21/09)', from: eng(2026), to: eng(2027) },
];
const LEGS = [['silverbullet', 'US100'], ['silverbullet', 'US500']];
const P = Object.fromEntries(PERIODS.map((p) => [p.id, p]));

const byRr = {};
for (const rr of RRS) {
  const missing = TRANCHES.filter((t) => !fs.existsSync(`data/live-replay/${t}-sbrr${rr}.json`));
  if (missing.length) { console.error(`RRR ${rr} : tranches manquantes ${missing.join(', ')}`); process.exit(1); }
  byRr[rr] = TRANCHES.flatMap((t) => JSON.parse(fs.readFileSync(`data/live-replay/${t}-sbrr${rr}.json`, 'utf8')).trades).sort((a, b) => a.entryTime - b.entryTime);
}
const st = (l) => { const n = l.length, s = l.reduce((a, t) => a + t.r, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, w: n ? l.filter((t) => t.r > 0).length / n * 100 : 0 }; };
const inP = (p) => (t) => t.entryTime >= p.from && t.entryTime < p.to;
const leg = (rr, src, sym) => byRr[rr].filter((t) => t.source === src && t.symbol === sym);
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);

function ftmo(trades, risk = 0.3) {
  const guard = buildEffectiveConfig({ id: 'x', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: risk }).guardrails;
  const evs = []; trades.forEach((t, i) => { evs.push({ time: t.entryTime + OFF, k: 1, i }); evs.push({ time: t.exitTime + OFF, k: 0, i }); });
  evs.sort((a, b) => a.time - b.time || b.k - a.k);
  let pass = 0, fail = 0, c;
  const start = (time) => { const g = new GuardrailEngine({ ...guard }); g.setBalance(10000, time); c = { start: time, g, bal: 10000, open: new Map() }; };
  if (!evs.length) return { pass, fail };
  start(evs[0].time);
  for (const ev of evs) {
    const t = trades[ev.i];
    if (ev.k === 1) { if (ev.time >= c.start && c.g.canTakeNewTrade(ev.time, t.symbol)) c.open.set(ev.i, c.bal * risk / 100); continue; }
    if (!c.open.has(ev.i)) continue;
    const pnl = c.open.get(ev.i) * t.r; c.open.delete(ev.i); c.bal += pnl;
    c.g.recordTrade({ pnl, time: ev.time, balanceAfter: c.bal, symbol: t.symbol });
    const s = c.g.getStatus(ev.time, t.symbol);
    if (s.targetReached || s.overallDrawdownBreached) { if (s.targetReached) pass++; else fail++; start(ev.time); }
  }
  return { pass, fail };
}

const md = ['# RRR du Silver Bullet au rejeu fidèle au live — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-silverbullet-rr-2026-09-24.md` (commité avant ce calcul). Rejeux : `SB_RR=<n> node scripts/runLiveReplay.js …` (config live, 0,3 %, 8 tranches avec 90 jours de préchauffage chacune), rapport : `scripts/runSilverBulletRrReport.js`. HistData reconstruit sur le poste d\'Esdras (fichiers identiques octet pour octet à ceux de la session cloud).', ''];
md.push('## Chaque jambe par RRR (R net, trades, t)', '');
for (const [src, sym] of LEGS) {
  md.push(`### Silver Bullet ${sym}`, '', `| RRR | ${PERIODS.map((p) => p.label.trim()).join(' | ')} |`, `|---|${PERIODS.map(() => '---').join('|')}|`);
  for (const rr of RRS) md.push(`| 1:${rr}${rr === 3 ? ' (actuel)' : ''} | ${PERIODS.map((p) => { const s = st(leg(rr, src, sym).filter(inP(p))); return `${sgn(s.s)} (${s.n}, t ${s.t.toFixed(2)})`; }).join(' | ')} |`);
  md.push('');
}
md.push('## Décision (règle pré-enregistrée)', '');
const decisions = [];
for (const [src, sym] of LEGS) {
  const train = RRS.map((rr) => ({ rr, s: st(leg(rr, src, sym).filter(inP(P.train))) }));
  const best = train.reduce((a, b) => (b.s.s > a.s.s ? b : a));
  const h1 = st(leg(best.rr, src, sym).filter(inP(P.h1))), h2 = st(leg(best.rr, src, sym).filter(inP(P.h2)));
  let verdict;
  if (best.rr === 3) verdict = `1:3 est déjà le meilleur RRR à l'entraînement (${sgn(best.s.s)} R) → **on garde 1:3**`;
  else if (!(best.s.t >= 2 && h1.s > 0 && h2.s > 0)) verdict = `meilleur à l'entraînement 1:${best.rr} (${sgn(best.s.s)} R, t ${best.s.t.toFixed(2)}, moitiés ${sgn(h1.s)} / ${sgn(h2.s)}) mais t < 2 ou une moitié négative → **on garde 1:3**`;
  else {
    const tBest = st(leg(best.rr, src, sym).filter(inP(P.test))), t3 = st(leg(3, src, sym).filter(inP(P.test)));
    verdict = `meilleur à l'entraînement 1:${best.rr} (${sgn(best.s.s)} R contre ${sgn(train.find((x) => x.rr === 3).s.s)} R à 1:3, t ${best.s.t.toFixed(2)}, moitiés ${sgn(h1.s)} / ${sgn(h2.s)}) ; test 2023-2025 lu une fois : ${sgn(tBest.s)} R à 1:${best.rr} contre ${sgn(t3.s)} R à 1:3 → ${tBest.s >= t3.s ? `**changement recommandé : 1:${best.rr}** (décision d'Esdras avant tout déploiement)` : '**on garde 1:3** (moins bon au test)'}`;
  }
  decisions.push(`- **Silver Bullet ${sym}** : ${verdict}`);
}
md.push(...decisions, '');
md.push('## Combo entier par RRR du Silver Bullet (descriptif)', '', '| RRR | Entraînement | Test 2023-2025 | 2026 | FTMO 1-Step 0,3 % réussis / ratés (entr. · test · 2026) |', '|---|---|---|---|---|');
for (const rr of RRS) {
  const cells = ['train', 'test', 'fwd'].map((id) => { const s = st(byRr[rr].filter(inP(P[id]))); return `${sgn(s.s)} R (${s.n}, t ${s.t.toFixed(2)})`; });
  const f = ['train', 'test', 'fwd'].map((id) => { const x = ftmo(byRr[rr].filter(inP(P[id]))); return `${x.pass}/${x.fail}`; });
  md.push(`| 1:${rr}${rr === 3 ? ' (actuel)' : ''} | ${cells.join(' | ')} | ${f.join(' · ')} |`);
}
md.push('', '## Limites', '', '- Même RRR sur les deux paires dans chaque rejeu ; A et B (momentum intraday) absents du rejeu.', '- 6 RRR comparés sur la même période : le meilleur à l\'entraînement contient une part de chance (d\'où la lecture du test).', '- HistData ≠ prix du broker ; spread par défaut, pas de glissement au-delà du spread.');
fs.writeFileSync('data/backtest-input/silverbullet-rr-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
