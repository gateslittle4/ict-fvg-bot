#!/usr/bin/env node
// runSilverBulletSecondPositionCheck.js
// Usage: node --max-old-space-size=4096 scripts/runSilverBulletSecondPositionCheck.js
//
// Esdras (2026-09-21, en direct) : un signal Silver Bullet US500 haussier
// (entrée 7733.4, stop 7720.69, cible 7771.53) a été bloqué par "netting"
// (une position Divergence US500 était déjà ouverte, entrée 7719.05 à 14h,
// clôturée gagnante à 7751.55 à 15h45). Question : Silver Bullet étant rare,
// le laisser s'ouvrir en 2e position MALGRÉ une paire déjà ouverte
// améliorerait-il le résultat, historiquement ?
//
// Rejoue tout l'historique M1 réel avec le vrai moteur (comme les scripts
// précédents), capture TOUS les signaux Silver Bullet bloqués par
// "netting" (pas seulement ceux exécutés), et règle chacun en M1 exact
// comme s'il avait été ouvert en position INDÉPENDANTE (stop/cible propres,
// sans interaction avec l'autre position déjà ouverte - hypothèse simple,
// voir Limites). Compare au total actuel (Silver Bullet jamais en 2e
// position).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = CONFIG.symbols;
const STARTING_BALANCE = 10000;
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);

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
function settleM1(symbol, direction, entryPrice, entryTime, stopPrice, targetPrice) {
  const S = M1[symbol]; const bull = direction === 'bullish';
  const start = lower(S.t, S.n, entryTime); const end = Math.min(S.n, lower(S.t, S.n, entryTime + 900000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= entryPrice && entryPrice <= S.h[i]) { fill = i; break; }
  if (fill < 0) fill = start < S.n ? start : -1;
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) {
    if (bull ? S.l[i] <= stopPrice : S.h[i] >= stopPrice) return { exitPrice: stopPrice, exitTime: S.t[i], outcome: 'loss' };
    if (bull ? S.h[i] >= targetPrice : S.l[i] <= targetPrice) return { exitPrice: targetPrice, exitTime: S.t[i], outcome: 'win' };
  }
  return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1], outcome: 'timeout (encore ouvert à la fin des données)' };
}

const orderedSymbols = ['US500', 'US100', ...SYMBOLS.filter((s) => s !== 'US500' && s !== 'US100')];
const ordered = {}; for (const s of orderedSymbols) ordered[s] = m15[s];
const warmupGuardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
warmupGuardrail.setBalance(STARTING_BALANCE, ordered[orderedSymbols[0]][0].time);
const engine = new LiveStrategyEngine({ symbols: orderedSymbols, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr, guardrail: warmupGuardrail, riskPctPerTrade: 0.3, spreads: DEFAULT_SPREADS });

const blockedSilverBullets = [];
let totalSilverBulletSignals = 0, executedSilverBullets = 0;
console.log('Phase 1 : warmUp() du vrai moteur, capture des signaux Silver Bullet (exécutés ET bloqués par netting)...');
engine.warmUp(ordered, {
  onEvent: (signal, candle) => {
    if (signal.type !== 'validated' || signal.source !== 'silverbullet') return;
    totalSilverBulletSignals++;
    if (!signal.blockedReason) { executedSilverBullets++; return; }
    if (signal.blockedReason !== 'netting') return; // on isole la question posée : bloqué SPÉCIFIQUEMENT par une autre position déjà ouverte
    blockedSilverBullets.push({ symbol: signal.symbol, direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, distance: signal.distance, entryTime: candle.time });
  },
});

console.log(`Signaux Silver Bullet: ${totalSilverBulletSignals} au total, ${executedSilverBullets} exécutés (jamais bloqués), ${blockedSilverBullets.length} bloqués par "netting" (une autre position déjà ouverte sur la même paire)\n`);

const results = blockedSilverBullets.map((sb) => {
  const r = settleM1(sb.symbol, sb.direction, sb.entryPrice, sb.entryTime, sb.stopPrice, sb.targetPrice);
  if (!r) return null;
  return { ...sb, outcome: r.outcome, netR: netR(sb.direction, sb.entryPrice, sb.distance, r.exitPrice, sb.symbol) };
}).filter(Boolean);

const totalR = results.reduce((a, t) => a + t.netR, 0);
const wins = results.filter((t) => t.netR > 0).length;
console.log(`=== Si CHAQUE Silver Bullet bloqué par netting avait été ouvert en position indépendante (réglé en M1 exact) ===`);
console.log(`Trades: ${results.length} | Gagnants: ${wins} (${(wins / results.length * 100).toFixed(0)}%) | R net total: ${fmt(totalR)} R | R/trade: ${fmt(totalR / results.length, 3)}`);
console.log('');
console.log('| Paire | Direction | Entrée | Heure (UTC) | Résultat | R net |');
console.log('|---|---|---|---|---|---|');
for (const t of results) {
  console.log(`| ${t.symbol} | ${t.direction} | ${t.entryPrice} | ${new Date(t.entryTime + FIXED_EST_TO_UTC_OFFSET_MS).toISOString()} | ${t.outcome} | ${fmt(t.netR)} |`);
}

const md = [];
md.push('# Silver Bullet en 2e position malgré une paire déjà ouverte (netting) — impact historique complet', '');
md.push(`Esdras (2026-09-21, en direct) : signal Silver Bullet US500 haussier bloqué par netting (Divergence US500 déjà ouverte). Question : Silver Bullet étant rare, le laisser s'ouvrir en 2e position améliorerait-il le résultat ? Tout l'historique M1 réel (\`data/real-m1-full\`), vrai moteur (\`LiveStrategyEngine\`), TOUS les signaux Silver Bullet bloqués par "netting" capturés (pas seulement l'exécuté), réglés en M1 exact comme des positions indépendantes.`, '');
md.push(`**${totalSilverBulletSignals} signaux Silver Bullet au total sur tout l'historique, ${executedSilverBullets} exécutés normalement, ${blockedSilverBullets.length} bloqués par netting** (une autre position déjà ouverte sur la même paire) — confirme "Silver Bullet est rare" ET que le cas "bloqué par netting" est rare aussi.`, '');
md.push(`**Si tous avaient été ouverts en 2e position indépendante : ${results.length} trades, ${wins} gagnants (${(wins / results.length * 100).toFixed(0)}%), R net total ${fmt(totalR)} R, ${fmt(totalR / results.length, 3)} R/trade.**`, '');
md.push('| Paire | Direction | Entrée | Heure (UTC) | Résultat | R net |', '|---|---|---|---|---|---|');
for (const t of results) md.push(`| ${t.symbol} | ${t.direction} | ${t.entryPrice} | ${new Date(t.entryTime + FIXED_EST_TO_UTC_OFFSET_MS).toISOString()} | ${t.outcome} | ${fmt(t.netR)} |`);
md.push('', '## Limites (IMPORTANTES avant tout changement de code)', '',
  '- **Contrainte broker non vérifiée** : `openPositions` est un Map PAR SYMBOLE partagé par tous les mécanismes (voir `liveStrategyEngine.js` ligne ~231) - le blocage "netting" reflète peut-être une VRAIE contrainte du compte cTrader (mode netting du broker : un 2e ordre sur la même paire fusionne avec la position existante au lieu de créer un stop/cible indépendant), pas juste une règle du bot. À vérifier auprès de FP Markets/cTrader (le compte doit supporter le mode HEDGING pour que 2 positions indépendantes sur la même paire aient chacune leur propre stop/cible réel) AVANT toute décision de code - sinon le changement ne ferait rien de plus qu\'agrandir la position existante avec un stop/cible différent, pas ouvrir un vrai 2e trade.',
  '- Le calcul ci-dessus suppose que la 2e position n\'a AUCUNE interaction avec la 1ère (sizing indépendant, pas de garde-fou partagé) - une vraie implémentation devrait aussi décider comment le risque total du compte est plafonné avec 2 positions simultanées sur la même paire.',
  '- Coûts partiels (spread mesuré, pas de commission/swap/glissement réel, pas le correctif de géométrie d\'ordre).');
fs.writeFileSync('data/backtest-input/silver-bullet-second-position-netting.md', md.join('\n'));
console.log('\nRapport écrit dans data/backtest-input/silver-bullet-second-position-netting.md');
