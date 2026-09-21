#!/usr/bin/env node
// runFtmoThroughputEconomics2026.js
// Usage: node --max-old-space-size=4096 scripts/runFtmoThroughputEconomics2026.js
//
// Esdras: "compte le vrai debit (challenges reussis par unite de temps), en
// tenant compte que chaque echec = un nouveau compte a racheter, pour voir
// si 0.5% fixe (plus de passes, plus de busts) rapporte en realite plus que
// l'adaptatif sur la duree." Reutilise la meme liste canonique de trades
// (meme warmUp, meme reglement M1 exact) que les scripts precedents, sur la
// meme fenetre test/forward (2026-01-01 -> aujourd'hui).
//
// FEE_PER_BUST : FTMO rembourse les frais de challenge une fois le compte
// FINANCE (voir HANDOFF.md 2026-09-16, "$500 withdrawal" - $230 pour un
// challenge $25k, rachat moyen 0.41x -> ~$94 de cout reel moyen) - donc
// seuls les RACHATS (busts) coutent quelque chose, jamais le succes final.
// Pas de prix $10k confirme dans ce depot (HANDOFF.md ligne 477: "page ne
// publie pas de tarif statique") - $89 utilise ici comme estimation
// PLACEHOLDER a verifier en direct sur ftmo.com avant toute decision, pas
// un chiffre source comme le $230/$25k.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = CONFIG.symbols;
const STARTING_BALANCE = 10000;
const CUT = Date.UTC(2026, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const FEE_PER_BUST = 89; // PLACEHOLDER non confirmé — à vérifier sur ftmo.com (voir en-tête)
const WINDOW_DAYS = 263; // 2026-01-01 -> 2026-09-21 (dernière bougie dispo)
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const fmt = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

function loadGz(sym) {
  const lines = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) { const p = lines[i].split(','); if (p.length < 5) continue; out.push({ time: +p[0] - FIXED_EST_TO_UTC_OFFSET_MS, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 }); }
  return out;
}
function toM15(m1) {
  const out = []; let cur = null;
  for (const c of m1) { const b = Math.floor(c.time / 900000) * 900000; if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }; } else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; } }
  if (cur) out.push(cur); return out;
}
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
const netR = (dir, entry, d, exit, sym) => { const g = (dir === 'bullish' ? exit - entry : entry - exit) / d; const s = DEFAULT_SPREADS[sym] ?? 0; return g - (s > 0 ? s / d : 0); };

console.log('Chargement M1 réel + reconstruction M15...');
const m1Bars = Object.fromEntries(SYMBOLS.map((s) => [s, loadGz(s)]));
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Bars[s])]));
const M1 = {};
for (const s of SYMBOLS) { const cs = m1Bars[s]; M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }
function settleM1(tr) {
  const S = M1[tr.symbol]; const bull = tr.direction === 'bullish';
  const start = lower(S.t, S.n, tr.entryTime); const end = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= tr.entryPrice && tr.entryPrice <= S.h[i]) { fill = i; break; }
  if (fill < 0) fill = start < S.n ? start : -1;
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) {
    if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { exitPrice: tr.stopPrice, exitTime: S.t[i], outcome: 'loss' };
    if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { exitPrice: tr.targetPrice, exitTime: S.t[i], outcome: 'win' };
  }
  return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1], outcome: 'timeout' };
}

function runPhase1() {
  const orderedSymbols = ['US500', 'US100', ...SYMBOLS.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {}; for (const s of orderedSymbols) ordered[s] = m15[s];
  const warmupGuardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  warmupGuardrail.setBalance(STARTING_BALANCE, ordered[orderedSymbols[0]][0].time);
  const engine = new LiveStrategyEngine({ symbols: orderedSymbols, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr, guardrail: warmupGuardrail, riskPctPerTrade: 0.5, spreads: DEFAULT_SPREADS });
  const pendingOpen = new Map(); const trades = [];
  engine.warmUp(ordered, { onEvent: (signal, candle) => {
    if (signal.type === 'validated' && !signal.blockedReason) { pendingOpen.set(signal.symbol, { symbol: signal.symbol, source: signal.source, direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, distance: signal.distance, entryTime: candle.time }); return; }
    if (signal.type !== 'closed') return;
    const open = pendingOpen.get(signal.symbol); pendingOpen.delete(signal.symbol); if (!open) return;
    const m1exit = settleM1(open); if (!m1exit) return;
    trades.push({ symbol: open.symbol, direction: open.direction, entryTime: open.entryTime, m1: { netR: netR(open.direction, open.entryPrice, open.distance, m1exit.exitPrice, open.symbol), exitTime: m1exit.exitTime } });
  } });
  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

console.log('Phase 1 : un seul warmUp() du vrai moteur, réglé en M1 exact...');
const allTrades = runPhase1();
const forwardTrades = allTrades.filter((t) => t.entryTime >= CUT);
console.log(`Trades test/forward: ${forwardTrades.length}\n`);

// riskFn(cycle) -> risque% courant pour ce cycle ; cycle = {peak, balance}
function runFtmoCycles(trades, riskFn) {
  const effective = buildEffectiveConfig({ id: 'ftmo-throughput-2026', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: 0.5 });
  const cycles = []; let cycle = null;
  function start(t0) { const g = new GuardrailEngine({ ...effective.guardrails }); g.setBalance(STARTING_BALANCE, t0); cycle = { n: cycles.length + 1, startTime: t0, endTime: null, outcome: 'en cours', balance: STARTING_BALANCE, peak: STARTING_BALANCE, guardrail: g }; }
  start(trades.length ? trades[0].entryTime : Date.now());
  for (const t of trades) {
    if (!cycle.guardrail.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const risk = riskFn(cycle);
    const pnl = cycle.balance * (risk / 100) * t.m1.netR;
    cycle.balance += pnl; cycle.peak = Math.max(cycle.peak, cycle.balance);
    cycle.guardrail.recordTrade({ pnl, time: t.m1.exitTime, balanceAfter: cycle.balance, symbol: t.symbol });
    const status = cycle.guardrail.getStatus(t.m1.exitTime, t.symbol);
    if (status.targetReached || status.overallDrawdownBreached) {
      cycle.endTime = t.m1.exitTime; cycle.outcome = status.targetReached ? 'RÉUSSI' : 'RATÉ';
      cycles.push(cycle); start(t.m1.exitTime);
    }
  }
  const completed = cycles; // cycle en cours (non terminé) exclu du débit — pas encore un résultat
  return { passes: completed.filter((c) => c.outcome === 'RÉUSSI').length, busts: completed.filter((c) => c.outcome === 'RATÉ').length, completed: completed.length };
}

const configs = [
  ['0.25% fixe', () => 0.25],
  ['0.3% fixe (risque réel live)', () => 0.3],
  ['0.5% fixe', () => 0.5],
  ['0.75% fixe', () => 0.75],
  ['1% fixe', () => 1.0],
  ['1.5% fixe', () => 1.5],
  ['Adaptatif 0.5→0.25 à -4% (retour immédiat sous 4%)', (cycle) => ((cycle.peak - cycle.balance) / cycle.peak * 100 >= 4 ? 0.25 : 0.5)],
];

const md = [];
md.push('# Débit réel de challenges (passes/an) et coût des rachats — fenêtre test/forward 2026-01-01 → aujourd\'hui, M1 exact', '');
md.push(`Question d'Esdras : le débit réel (challenges réussis par unité de temps) plutôt que juste "réussis/ratés" — chaque échec coûte un rachat. **FEE_PER_BUST = $${FEE_PER_BUST} : PLACEHOLDER non confirmé** (aucun tarif $10k publié trouvé — voir HANDOFF.md 2026-09-16 ; le seul chiffre sourcé de ce dépôt est $230 pour un challenge $25k, remboursé une fois financé). À vérifier en direct sur ftmo.com avant toute décision d'achat réel — seule la comparaison RELATIVE entre configurations ci-dessous est fiable, pas le $ absolu.`, '');
md.push('| Configuration | Cycles terminés | Réussis | Ratés | Passes/an (263 j) | Coût rachats total | Coût par passe |', '|---|---|---|---|---|---|---|');
console.log('| Configuration | Réussis | Ratés | Passes/an | Coût rachats | Coût/passe |');
for (const [name, riskFn] of configs) {
  const { passes, busts, completed } = runFtmoCycles(forwardTrades, riskFn);
  const passesPerYear = passes / (WINDOW_DAYS / 365);
  const totalFee = busts * FEE_PER_BUST;
  const costPerPass = passes > 0 ? totalFee / passes : null;
  md.push(`| ${name} | ${completed} | ${passes} | ${busts} | ${passesPerYear.toFixed(2)} | $${totalFee} | ${costPerPass !== null ? '$' + costPerPass.toFixed(0) : '—'} |`);
  console.log(`| ${name} | ${passes} | ${busts} | ${passesPerYear.toFixed(2)} | $${totalFee} | ${costPerPass !== null ? '$' + costPerPass.toFixed(0) : '—'} |`);
}
md.push('', '## Limites', '', '- Ne compte QUE le débit de passes de la phase challenge, pas les revenus du compte financé après (chaque passe donne un compte financé qui continue de composer séparément avec le même plancher — question différente, plus grande, déjà traitée pour FTMO $25k dans HANDOFF.md "$500 withdrawal").', '- FEE_PER_BUST est un placeholder, pas une valeur sourcée — à corriger avant toute décision d\'achat réel.', '- Cycle en cours en fin de fenêtre exclu du débit (résultat pas encore connu).', '- Même limites que les rapports précédents (coûts partiels, garde-fous réels mais pas de correctif de géométrie d\'ordre).');
fs.writeFileSync('data/backtest-input/ftmo-throughput-economics-2026.md', md.join('\n'));
console.log('\nRapport écrit dans data/backtest-input/ftmo-throughput-economics-2026.md');
