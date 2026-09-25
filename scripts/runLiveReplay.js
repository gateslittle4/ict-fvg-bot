#!/usr/bin/env node
// runLiveReplay.js - rejoue l'historique EXACTEMENT comme le bot live le vit (Esdras, 2026-09-23 : « il doit suivre le marché
// à 100 % », après avoir constaté que chaque modèle d'exécution des études donnait un chiffre différent).
//
// Même classe LiveStrategyEngine, appelée comme cTraderDataSource._ingestNewLiveBar :
//   - chaque bougie M15 arrive d'abord à sa PREMIÈRE cotation (ouverture seule) : c'est là, et seulement là, que les signaux
//     sont évalués ; la bougie précédente est alors complète (le live la recale sur les valeurs finales du broker) ;
//   - entrée MARKET tout de suite (achat à l'ask = bid + spread), stop et objectif envoyés en distances relatives au prix
//     d'exécution, décalés du spread comme adjustMarketProtectionForSpread ; sorties au bid (achat) / à l'ask (vente),
//     minute par minute, un gap à travers le stop sort à l'ouverture de la minute (perte > 1 R) ;
//   - durée max atteinte (événement 'closed'/'timeout') : clôture au marché (cTraderDataSource._closeRealPositionsAfterTimeout) ;
//   - netting du moteur relâché seulement à la clôture réelle (deferCloseToRealConfirmation, clearBelievedPosition) ;
//   - vrai GuardrailEngine du compte (3 trades/jour, pause 30 min, perte du jour 2 %), nourri du vrai P&L à chaque clôture ;
//   - RSI(2)/US500 journalier (DailyAlertEngine), exclusion mutuelle avec l'intraday sur US500, comme le live ;
//   - coûts : spread par défaut et swap du broker, en % du prix (niveau de prix d'aujourd'hui appliqué au passé).
// Limites : pas de glissement sur les ordres MARKET au-delà du spread, pas d'arrondi des lots, spread constant.
//
// Usage : node --max-old-space-size=6144 scripts/runLiveReplay.js <hist|broker> [risque % = 0.5] [année début] [année fin exclue]
//   -> data/live-replay/<src>-<début>-<fin>.json (trades) + résumé ; chaque tranche repart de 90 jours de préchauffage, comme
//   le live après un déploiement (le R ne dépend pas du solde, les tranches se recollent) ;
//   node scripts/runLiveReplay.js summary -> toutes les tranches réunies, par période du protocole et par stratégie.
import fs from 'node:fs';
import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DailyAlertEngine } from '../src/dailyAlertEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { MANAGED_SOURCES, entryBlockReason, momentumEntryBlockReason, momentumOrderSignal, orderProtection } from '../src/execution/entryPolicy.js';
import { IntradayMomentumEngine } from '../src/intradayMomentumEngine.js';
import { CONFIG } from '../src/config.js';
import { OFF, eng, loadM1, toM15, lower, refPrice, swapPerUnit } from './lib/m1Data.js';
import { fridayCloseReached } from './lib/weekendClose.js';

const SRC = process.argv[2];
if (SRC === 'summary') { summary(); process.exit(0); }
if (!['hist', 'broker'].includes(SRC)) { console.error('Usage: runLiveReplay.js <hist|broker|summary> [risque %] [année début] [année fin]'); process.exit(1); }
const RISK = Number(process.argv[3] ?? 0.5);
// FROM_DATE=2026-09-21T01:16:00Z : début précis (UTC) au lieu d'une année ; DEBUG_EVENTS=1 : affiche chaque signal validé, bloqué ou non.
const FROM = process.env.FROM_DATE ? Date.parse(process.env.FROM_DATE) - OFF : process.argv[4] ? eng(Number(process.argv[4])) : -Infinity;
const TO = process.argv[5] ? eng(Number(process.argv[5])) : Infinity;
// SB_RR=<n> : RRR du Silver Bullet remplacé (preregistration-silverbullet-rr-2026-09-24.md), fichiers séparés.
const SB_RR = process.env.SB_RR ? Number(process.env.SB_RR) : null;
// WEEKEND_CLOSE=1 : vendredi 16:45 New York, positions du combo fermées (RSI(2), A, B exceptées) et plus d'entrée du combo jusqu'au
// dimanche (preregistration-weekend-close-2026-09-25.md), fichiers séparés.
const WEEKEND_CLOSE = process.env.WEEKEND_CLOSE === '1';
const TAG = `${SRC}-${process.argv[4] ?? 'debut'}-${process.argv[5] ?? 'fin'}${process.env.SPREAD_MULT != null ? `-spread${process.env.SPREAD_MULT}` : ''}${SB_RR ? `-sbrr${SB_RR}` : ''}${WEEKEND_CLOSE ? '-weekendclose' : ''}`;
const START_BALANCE = 10000;
const WARMUP_BARS = 8640; // ce que le live demande au démarrage (90 jours de M15)
const DAILY = 'rsi2-daily';
// A (ORB 5 min) et B (noise area), comme en live depuis le 2026-09-24 : même moteur (IntradayMomentumEngine), mêmes règles d'entrée et de
// taille (src/execution/entryPolicy.js, partagé avec cTraderDataSource). NO_AB=1 : rejeu sans A/B (reproduit les études d'avant cet ajout).
const MOM = CONFIG.intradayMomentum;
const WITH_AB = Boolean(MOM?.enabled) && process.env.NO_AB !== '1';
// STOPPED_LEGS="silverbullet US500,..." : jambes arrêtées par le filet de sécurité pendant tout le rejeu (runWeeklyLiveCheck.js les lit sur le bot).
const STOPPED = new Set((process.env.STOPPED_LEGS || '').split(',').map((x) => x.trim()).filter(Boolean));
const legAllowed = (source, sym) => !STOPPED.has(`${source} ${sym}`);
const MIN = 60000;

// Symboles réellement tradés en live par l'intraday (FVG et Judas Swing retirés - voir config.js) + RSI(2) sur US500.
const fvgLive = Object.fromEntries(Object.entries(CONFIG.fvg.perSymbol).filter(([s]) => (CONFIG.fvg.liveSymbols ?? []).includes(s)));
const used = new Set([...Object.keys(fvgLive), ...CONFIG.divergence.pair, ...['nwog', 'judasSwing', 'weeklySweep', 'breakerBlock', 'silverBullet', 'cbdr'].flatMap((k) => CONFIG[k].symbols), 'US500']);
const SYMS = ['US100', 'US500', 'XAUUSD', 'EURUSD'].filter((s) => used.has(s));

const t0 = Date.now();
const data = {};
for (const s of SYMS) { const m1 = loadM1(SRC, s); data[s] = { m1, m15: toM15(m1) }; }
console.log(`${SRC} : ${SYMS.join(', ')} chargés (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// SPREAD_MULT=0 : exécution sans spread (mesure du coût du spread par stratégie ; le filtre « stop >= 3 x spread » du moteur reste inchangé).
const SPREAD_MULT = process.env.SPREAD_MULT != null ? Number(process.env.SPREAD_MULT) : 1;
const spreadAt = (s, price) => SPREAD_MULT * (DEFAULT_SPREADS[s] ?? 0) * (price / refPrice(s));
const guardrail = new GuardrailEngine({ ...CONFIG.guardrails });
const firstLive = Math.max(FROM, ...SYMS.map((s) => data[s].m15[Math.min(WARMUP_BARS, data[s].m15.length - 1)].time));
guardrail.setBalance(START_BALANCE, firstLive + OFF);
const engine = new LiveStrategyEngine({
  symbols: SYMS, fvgConfig: fvgLive, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing,
  weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: SB_RR ? { ...CONFIG.silverBullet, rrMultiple: SB_RR } : CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr,
  guardrail, riskPctPerTrade: RISK, spreads: DEFAULT_SPREADS,
});
// Préchauffage comme au démarrage du live, puis nettoyage des positions « crues » sans ordre réel (_clearStaleBeliefsAgainstBroker).
const warm = {}; for (const s of SYMS) warm[s] = data[s].m15.filter((c) => c.time < firstLive).slice(-WARMUP_BARS);
engine.warmUp(warm, { completeDivergencePair: process.env.BOOT_WARMUP !== '1' }); // BOOT_WARMUP=1 : exactement comme le boot live (sans compléter la paire Divergence)
for (const s of SYMS) { const b = engine.getOpenPosition(s); if (b) engine.clearBelievedPosition(s, b.id); }
const daily = new DailyAlertEngine({ strategy: DAILY, symbol: 'US500' });
daily.warmUp(warm.US500);

let balance = START_BALANCE;
const open = []; // positions réelles
const trades = [];
// Positions tenues par une stratégie gérée (RSI(2), A, B) - dailyPositionBySymbol en live : une seule par paire.
const managed = new Map();
const heldBy = (sym) => managed.get(sym)?.source ?? null;

function closePosition(p, exitBid, exitTime, reason) {
  const s = p.spread;
  const exitPx = p.dir === 'bullish' ? exitBid : exitBid + s; // un achat sort au bid, une vente à l'ask
  const move = p.dir === 'bullish' ? exitPx - p.fill : p.fill - exitPx;
  const swap = swapPerUnit(p.sym, p.dir, p.fillTime, exitTime) * (p.fill / refPrice(p.sym));
  const pnl = (move + swap) * p.units;
  balance += pnl;
  guardrail.recordTrade({ pnl, time: exitTime + OFF, balanceAfter: balance, symbol: p.sym });
  if (MANAGED_SOURCES.has(p.source)) { if (managed.get(p.sym) === p) managed.delete(p.sym); } else engine.clearBelievedPosition(p.sym, p.signalId);
  trades.push({ symbol: p.sym, source: p.source, direction: p.dir, entryTime: p.fillTime, exitTime, r: Math.round((pnl / p.risk) * 1e4) / 1e4, pnl: Math.round(pnl * 100) / 100, balance: Math.round(balance * 100) / 100, reason });
  open.splice(open.indexOf(p), 1);
}

/** Sorties broker (stop / objectif) minute par minute jusqu'à `until` (exclu), dans l'ordre du temps. */
function runExits(until) {
  for (;;) {
    let best = null;
    for (const p of open) {
      const S = data[p.sym].m1;
      const end = lower(S.t, S.n, until);
      for (let i = p.cursor; i < end; i++) {
        const s = p.spread; const bull = p.dir === 'bullish';
        // niveaux de déclenchement exprimés en bid : achat -> stop/objectif au bid ; vente -> déclenchés par l'ask = bid + s
        const stopHit = bull ? S.l[i] <= p.sl : S.h[i] + s >= p.sl;
        const tpHit = p.tp != null && (bull ? S.h[i] >= p.tp : S.l[i] + s <= p.tp);
        if (stopHit || tpHit) {
          let exitBid;
          if (stopHit) exitBid = bull ? Math.min(S.o[i], p.sl) : Math.max(S.o[i], p.sl - s); // gap à travers le stop : sortie à l'ouverture
          else exitBid = bull ? Math.max(S.o[i], p.tp) : Math.min(S.o[i], p.tp - s);
          if (!best || S.t[i] < best.time) best = { p, time: S.t[i], exitBid, reason: stopHit ? 'stop' : 'target' };
          break;
        }
        p.cursor = i + 1;
      }
    }
    if (!best) return;
    closePosition(best.p, best.exitBid, best.time, best.reason);
  }
}

function openPosition(sym, source, signalId, dir, entryPrice, stopPrice, targetPrice, T, { sizingStopPrice, maxNotional, atBid } = {}) {
  const S = data[sym].m1; const i = lower(S.t, S.n, T); if (i >= S.n) return null;
  // atBid : prix connu à la minute exacte (A/B, depuis leurs propres M1) - sinon l'ouverture de la ligne de données suivante.
  const bid = atBid ?? S.o[i]; const s = spreadAt(sym, bid);
  const side = dir === 'bullish' ? 'buy' : 'sell';
  // Stop/objectif envoyés et stop de calcul de la taille : entryPolicy.orderProtection, la même fonction que le bot.
  const { protection: prot, sizingStopPrice: sizeStop } = orderProtection({ suggestedSide: side, entryPrice, stopPrice, targetPrice, sizingStopPrice }, { spread: s });
  const stopDist = Math.abs(entryPrice - prot.stopPrice);
  if (!(stopDist > 0)) return null;
  const tgtDist = prot.targetPrice == null ? null : Math.abs(prot.targetPrice - entryPrice);
  const fill = dir === 'bullish' ? bid + s : bid;
  const sizeDist = Math.abs(entryPrice - sizeStop);
  let risk = balance * (RISK / 100);
  let units = risk / sizeDist;
  // Plafond d'exposition de A/B (4 x le solde) : le risque réel diminue dans la même proportion, comme capLots en live.
  if (Number.isFinite(maxNotional) && units * bid > maxNotional) { const k = maxNotional / (units * bid); units *= k; risk *= k; }
  const p = {
    sym, source, signalId, dir, fill, fillTime: atBid != null ? T : S.t[i], spread: s, units, risk, cursor: i,
    sl: dir === 'bullish' ? fill - stopDist : fill + stopDist,
    tp: tgtDist == null ? null : dir === 'bullish' ? fill + tgtDist : fill - tgtDist,
  };
  open.push(p);
  if (MANAGED_SOURCES.has(source)) managed.set(sym, p);
  return p;
}

// A et B : barres M1 données une par une au moteur (heures UTC, comme les barres construites à partir des ticks en live) ; chaque décision
// est exécutée au prix d'ouverture de la minute suivante. Préchauffage : 30 jours de M1, comme _startIntradayMomentum.
const momentum = WITH_AB ? new IntradayMomentumEngine({
  orbSymbols: (MOM.orb?.symbols || []).filter((x) => SYMS.includes(x)), noiseSymbols: (MOM.noise?.symbols || []).filter((x) => SYMS.includes(x)), lookback: MOM.noise?.lookback ?? 14,
}) : null;
// Source des M1 de A/B : les vraies M1 du fichier jusqu'à m1End, puis (LIVE_M1_DIR/live-m1-<SYM>.json, heures UTC) les barres M1 que le
// bot a lui-même construites à partir des ticks pour A/B (GET /api/momentum-bars) - jamais les lignes M15 du prolongement (fausses décisions).
const mData = {};
const mIdx = {};
if (momentum) {
  for (const sym of momentum.symbols) {
    const S = data[sym].m1; const end = lower(S.t, S.n, S.m1End + 1);
    const t = Array.from(S.t.subarray(0, end)), o = Array.from(S.o.subarray(0, end)), h = Array.from(S.h.subarray(0, end)), l = Array.from(S.l.subarray(0, end)), c = Array.from(S.c.subarray(0, end));
    const f = process.env.LIVE_M1_DIR && `${process.env.LIVE_M1_DIR}/live-m1-${sym}.json`;
    if (f && fs.existsSync(f)) for (const b of JSON.parse(fs.readFileSync(f, 'utf8')).bars) { const bt = b.time - OFF; if (bt > S.m1End) { t.push(bt); o.push(b.open); h.push(b.high); l.push(b.low); c.push(b.close); } }
    mData[sym] = { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length };
  }

  for (const sym of momentum.symbols) {
    const S = mData[sym]; const i0 = lower(S.t, S.n, firstLive); const iw = lower(S.t, S.n, firstLive - (MOM.warmupDays ?? 30) * 86400000);
    const bars = []; for (let i = iw; i < i0; i++) bars.push({ time: S.t[i] + OFF, open: S.o[i], high: S.h[i], low: S.l[i], close: S.c[i] });
    momentum.addBars(sym, bars);
    mIdx[sym] = i0;
  }
}
function executeMomentumEvent(ev, t) {
  const sym = ev.symbol; const M = mData[sym]; const j = lower(M.t, M.n, t);
  // Prix d'exécution : l'ouverture de la minute t dans les M1 de A/B (le premier tick après la décision, en live).
  if (j >= M.n || M.t[j] - t > 5 * MIN) return; // pas de cotation dans les 5 minutes : marché fermé
  const bid = M.o[j];
  const held = managed.get(sym);
  if (ev.type === 'exit') { if (held && held.source === ev.strategy) closePosition(held, bid, t, ev.reason === 'close' ? 'close' : 'signal'); return; }
  const blocked = momentumEntryBlockReason({ heldBy: heldBy(sym), comboHolds: Boolean(engine.getOpenPosition(sym)), guardrailOk: guardrail.canTakeNewTrade(t + OFF, sym) })
    ?? entryBlockReason({ source: ev.strategy, heldBy: heldBy(sym), legAllowed: legAllowed(ev.strategy, sym) });
  if (blocked) { if (process.env.DEBUG_EVENTS) console.log(`  [A/B] ${new Date(t + OFF).toISOString().slice(0, 16)} ${ev.strategy} ${sym} ${ev.side} BLOQUÉ: ${blocked}`); return; }
  const plan = momentumOrderSignal(ev, { bid, spread: spreadAt(sym, bid), balance, cfg: MOM });
  if (plan.skip) return;
  openPosition(sym, ev.strategy, null, ev.side === 'buy' ? 'bullish' : 'bearish', bid, plan.signal.stopPrice, plan.signal.targetPrice, t, { sizingStopPrice: plan.signal.sizingStopPrice, maxNotional: plan.maxNotional, atBid: bid });
}
/** Donne à A/B toutes les barres M1 finies avant `until` (ou jusqu'à `until` inclus), dans l'ordre du temps, avec les sorties broker entre deux. */
function feedMomentum(until, inclusive) {
  if (!momentum) return;
  for (;;) {
    let sym = null, t = Infinity;
    for (const s of momentum.symbols) { const S = mData[s]; const i = mIdx[s]; if (i < S.n && S.t[i] < t) { t = S.t[i]; sym = s; } }
    if (sym === null) return;
    const done = t + MIN; // la barre de t est finie à t + 1 min
    if (inclusive ? done > until : done >= until) return;
    const S = mData[sym]; const i = mIdx[sym]++;
    runExits(done);
    const evs = momentum.ingestBar(sym, { time: t + OFF, open: S.o[i], high: S.h[i], low: S.l[i], close: S.c[i] });
    for (const ev of [...evs, ...momentum.onClock(done + OFF)]) executeMomentumEvent(ev, done);
  }
}

// Boucle : toutes les bougies M15 après le préchauffage, dans l'ordre du temps (tous symboles).
const idx = {}; for (const s of SYMS) idx[s] = lower(data[s].m15.map((c) => c.time), data[s].m15.length, firstLive);
const times = [...new Set(SYMS.flatMap((s) => data[s].m15.slice(idx[s]).map((c) => c.time)))].filter((t) => t < TO).sort((a, b) => a - b);
let lastLog = Date.now();
const MAX_BARS = Number(process.env.MAX_BARS || Infinity); // profilage : s'arrêter après N horodatages
let nBars = 0;
for (const T of times) {
  if (++nBars > MAX_BARS) break;
  feedMomentum(T, false); // A/B : minutes finies avant T (en live, le combo traite sa bougie avant A/B à la même minute)
  runExits(T);
  // Balayage des positions « crues » sans position réelle (_clearStaleBeliefsAgainstBroker, toutes les 5 min en live, donc
  // avant la bougie suivante) : un signal validé puis refusé (exclusion RSI(2), taille nulle...) ne bloque pas le symbole.
  // Absent jusqu'au 2026-09-23 : la croyance restait coincée pour des mois (Divergence US500 bloquée « netting » dès juillet).
  for (const s of SYMS) { const b = engine.getOpenPosition(s); if (b && !open.some((p) => p.sym === s)) engine.clearBelievedPosition(s, b.id); }
  const weekendLock = WEEKEND_CLOSE && fridayCloseReached(T);
  if (weekendLock) {
    for (const p of open.filter((x) => !MANAGED_SOURCES.has(x.source))) { const S = data[p.sym].m1; const i = lower(S.t, S.n, T); if (i < S.n) closePosition(p, S.o[i], S.t[i], 'weekend'); }
  }
  for (const sym of SYMS) {
    const bars = data[sym].m15; const k = idx[sym];
    if (k >= bars.length || bars[k].time !== T) continue;
    idx[sym] = k + 1;
    const bar = bars[k];
    const prev = engine.getLastCandle(sym);
    if (prev && k > 0 && bars[k - 1].time === prev.time) engine.ingestCandle(sym, { ...bars[k - 1] }, bars[k - 1].time + OFF); // bougie précédente complète
    // Fenêtre glissante comme le live : il repart de WARMUP_BARS bougies à chaque redémarrage (déploiement) et garde ce qui arrive
    // ensuite - ici coupé à WARMUP_BARS dès que 30 jours de plus sont accumulés. Seul entryIndex d'une position ouverte dépend
    // de la position dans l'historique (âge pour la durée max) : recalé du même nombre.
    const hist = engine.history.get(sym);
    if (hist.length > WARMUP_BARS + 2880) {
      const cut = hist.length - WARMUP_BARS;
      hist.splice(0, cut);
      const op = engine.openPositions.get(sym);
      if (op) op.entryIndex -= cut;
    }
    const stub = { time: T, open: bar.open, high: bar.open, low: bar.open, close: bar.open, volume: 0 };
    const now = T + OFF;
    const events = engine.ingestCandle(sym, stub, now, { deferCloseToRealConfirmation: true });
    for (const e of events) {
      if (process.env.DEBUG_EVENTS && e.type === 'validated') console.log(`  [signal] ${new Date(now).toISOString().slice(0, 16)} ${e.source} ${e.symbol ?? sym} ${e.direction} ${e.blockedReason ? 'BLOQUÉ: ' + e.blockedReason : 'pris'}${heldBy(e.symbol ?? sym) ? ` (${heldBy(e.symbol ?? sym)} tient ${e.symbol ?? sym})` : ''}`);
      if (e.type === 'validated' && !e.blockedReason) {
        if (e.source === 'fvg') continue; // retiré du live
        if (weekendLock) continue;
        const esym = e.symbol ?? sym; // une Divergence peut concerner l'autre jambe de la paire (routée comme le live)
        if (entryBlockReason({ source: e.source, heldBy: heldBy(esym), legAllowed: legAllowed(e.source, esym) })) continue; // même règle que _handleAutoExecuteEntry
        openPosition(esym, e.source, e.id, e.direction, e.entryPrice, e.stopPrice, e.targetPrice, T);
      } else if (e.type === 'closed' && e.outcome === 'timeout') {
        const S = data[sym].m1; const i = lower(S.t, S.n, T);
        for (const p of open.filter((x) => x.sym === sym && x.source === e.source)) closePosition(p, S.o[i], S.t[i], 'timeout');
      }
    }
    if (sym === 'US500') {
      if (k > 0) daily.updateFormingBar(bars[k - 1]);
      for (const ev of daily.ingest(stub)) {
        if (ev.event === 'entry' && guardrail.canTakeNewTrade(now, 'US500') && !entryBlockReason({ source: DAILY, heldBy: heldBy('US500'), legAllowed: legAllowed(DAILY, 'US500') })) {
          openPosition('US500', DAILY, null, 'bullish', ev.price, ev.stopPrice, null, T);
        } else if (ev.event === 'exit' && ev.detail !== 'stop' && managed.get('US500')?.source === DAILY) {
          const S = data.US500.m1; const i = lower(S.t, S.n, T);
          closePosition(managed.get('US500'), S.o[i], S.t[i], ev.detail);
        }
      }
    }
  }
  feedMomentum(T, true);
  if (Date.now() - lastLog > 30000) { lastLog = Date.now(); console.log(`  ${new Date(T + OFF).toISOString().slice(0, 10)} - ${trades.length} trades, solde ${balance.toFixed(0)}`); }
}
// fin de tranche : les positions encore ouvertes sortent à leur stop/objectif ou au dernier prix connu (comme runExits(Infinity))
runExits(Infinity);

// REPLAY_OUT=<fichier> : écrit ailleurs que data/live-replay/ (runWeeklyLiveCheck.js - ne jamais mêler un rejeu d'une semaine au résumé 2010-2026).
const outFile = process.env.REPLAY_OUT || `data/live-replay/${TAG}.json`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ risk: RISK, startBalance: START_BALANCE, from: firstLive, trades }));
const periodsOld = SRC === 'hist' ? [['2010-2016', eng(2010), eng(2017)], ['2017-2022', eng(2017), eng(2023)]] : [['2023-2025', eng(2023), eng(2026)], ['2026', eng(2026), eng(2027)]];
const stat = (l) => { const n = l.length; const s = l.reduce((a, t) => a + t.r, 0); const m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return `${n} trades, ${n ? Math.round(100 * l.filter((t) => t.r > 0).length / n) : 0} % gagnants, ${s >= 0 ? '+' : ''}${s.toFixed(1)} R, t ${sd ? (m / (sd / Math.sqrt(n))).toFixed(2) : '—'}`; };
console.log(`\nRejeu live ${SRC}, risque ${RISK} % (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
for (const [lab, a, b] of periodsOld) {
  const l = trades.filter((t) => t.entryTime >= a && t.entryTime < b);
  console.log(`\n${lab} : ${stat(l)}`);
  for (const src of [...new Set(l.map((t) => `${t.source} ${t.symbol}`))].sort()) console.log(`   ${src.padEnd(24)} ${stat(l.filter((t) => `${t.source} ${t.symbol}` === src))}`);
}
let peak = START_BALANCE, dd = 0; for (const t of trades) { peak = Math.max(peak, t.balance); dd = Math.max(dd, (peak - t.balance) / peak * 100); }
console.log(`\nSolde final ${balance.toFixed(0)} (départ ${START_BALANCE}), pire baisse ${dd.toFixed(1)} %`);

function summary() {
  const files = fs.readdirSync('data/live-replay').filter((f) => f.endsWith('.json'));
  const all = files.flatMap((f) => JSON.parse(fs.readFileSync(`data/live-replay/${f}`, 'utf8')).trades).sort((a, b) => a.entryTime - b.entryTime);
  const PER = [['Entraînement 2010-2022', eng(2010), eng(2023)], ['  2010-2016', eng(2010), eng(2017)], ['  2017-2022', eng(2017), eng(2023)], ['Test 2023-2025', eng(2023), eng(2026)], ['Forward 2026', eng(2026), eng(2027)]];
  const st = (l) => { const n = l.length; const s = l.reduce((a, t) => a + t.r, 0); const m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, w: n ? l.filter((t) => t.r > 0).length / n * 100 : 0 }; };
  const fmt = (x) => `${x.n} tr. | ${x.w.toFixed(0)} % | ${x.s >= 0 ? '+' : ''}${x.s.toFixed(1)} R | ${x.m >= 0 ? '+' : ''}${x.m.toFixed(3)} | t ${x.t.toFixed(2)}`;
  console.log(`Rejeu fidèle au live - ${files.length} tranches, ${all.length} trades\n`);
  for (const [lab, a, b] of PER) console.log(`${lab.padEnd(24)} ${fmt(st(all.filter((t) => t.entryTime >= a && t.entryTime < b)))}`);
  const keys = [...new Set(all.map((t) => `${t.source} ${t.symbol}`))].sort();
  console.log('\nPar stratégie : entraînement 2010-2022 | test 2023-2025 | forward 2026 (R net, t)');
  for (const k of keys) {
    const l = all.filter((t) => `${t.source} ${t.symbol}` === k);
    console.log(`${k.padEnd(24)} ${[PER[0], PER[3], PER[4]].map(([, a, b]) => { const x = st(l.filter((t) => t.entryTime >= a && t.entryTime < b)); return `${x.s >= 0 ? '+' : ''}${x.s.toFixed(1)} R (${x.n}, t ${x.t.toFixed(2)})`; }).join(' | ')}`);
  }
  const reasons = {}; for (const t of all) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
  const big = all.filter((t) => t.r < -1.2).length;
  console.log(`\nSorties : ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', ')} ; pertes > 1,2 R (gaps) : ${big}`);
}
