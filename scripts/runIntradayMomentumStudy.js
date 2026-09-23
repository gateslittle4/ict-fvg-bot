#!/usr/bin/env node
// runIntradayMomentumStudy.js
// Usage : node --max-old-space-size=6144 scripts/runIntradayMomentumStudy.js      (il faut data/histdata-m1, voir buildHistdataM1.js)
//         DRY=1 node scripts/runIntradayMomentumStudy.js   -> vérifie la chaîne sur 2 mois du broker, n'affiche que des nombres de trades
//
// Les trois stratégies de momentum intraday EXACTEMENT telles que pré-enregistrées dans
// data/backtest-input/preregistration-intraday-momentum-2026-09-23.md (commité AVANT ce script) ; règles dans scripts/lib/intradayMomentum.js.
// Entraînement 2010-2022 = HistData M1 ; test 2023-2025 et 2026 = M1 du broker. Rapport : data/backtest-input/intraday-momentum-study.md.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';
import { buildSessions, orbTrade, noiseTrades, lastHalfHourTrade, dailyVol } from './lib/intradayMomentum.js';

const DRY = process.env.DRY === '1';
const SYMBOLS = ['US100', 'US500'];
const START = 10000;
const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [
  { id: 'train', label: 'Entraînement 2010-2022', from: Y(2010), to: Y(2023) },
  { id: 'test', label: 'Test 2023-2025', from: Y(2023), to: Y(2026) },
  { id: 'fwd', label: '2026 (→ fin des données)', from: Y(2026), to: Y(2027) },
];
const HALVES = [[Y(2010), Y(2017)], [Y(2017), Y(2023)]];
// Jambes : A (R par trade), B et C (rendement net par trade, en % du nominal). Principales = instrument de l'article.
const LEGS = [
  { id: 'A-US100', strat: 'orb', sym: 'US100', primary: true, label: 'A. Range d\'ouverture 5 min — US100 (principale)' },
  { id: 'B-US500', strat: 'noise', sym: 'US500', primary: true, label: 'B. Noise area — US500 (principale)' },
  { id: 'C-US500', strat: 'lasthalf', sym: 'US500', primary: true, label: 'C. Dernière demi-heure — US500 (principale)' },
  { id: 'A-US500', strat: 'orb', sym: 'US500', primary: false, label: 'A. Range d\'ouverture 5 min — US500 (contrôle)' },
  { id: 'B-US100', strat: 'noise', sym: 'US100', primary: false, label: 'B. Noise area — US100 (contrôle)' },
  { id: 'C-US100', strat: 'lasthalf', sym: 'US100', primary: false, label: 'C. Dernière demi-heure — US100 (contrôle)' },
];
const valueOf = (leg, t) => (leg.strat === 'orb' ? t.r : t.ret * 100); // A en R, B/C en % du nominal

function readGz(file) {
  const txt = zlib.gunzipSync(fs.readFileSync(file)).toString('latin1');
  let n = 0; for (let i = 0; i < txt.length; i++) if (txt.charCodeAt(i) === 10) n++;
  const t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  let k = 0, pos = txt.indexOf('\n') + 1;
  while (pos > 0 && pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const p = txt.slice(pos, end).split(','); pos = end + 1;
    if (p.length >= 5) { t[k] = +p[0]; o[k] = +p[1]; h[k] = +p[2]; l[k] = +p[3]; c[k] = +p[4]; k++; }
  }
  return { t: t.subarray(0, k), o: o.subarray(0, k), h: h.subarray(0, k), l: l.subarray(0, k), c: c.subarray(0, k), n: k };
}
const refCache = {};
function refPrice(sym) { // même convention que runLiveReplay.js : spread en % du prix actuel
  if (!refCache[sym]) { const S = readGz(`data/real-m1-full/${sym}.csv.gz`); refCache[sym] = S.c[S.n - 1]; }
  return refCache[sym];
}

/** Toutes les séances d'un symbole, par source (l'historique d'une source n'est jamais recollé à l'autre pour le calcul du bruit). */
function loadDays(sym) {
  const out = [];
  if (!DRY) {
    const f = `data/histdata-m1/${sym}.csv.gz`;
    if (!fs.existsSync(f)) { console.error(`${f} manquant : lancer d'abord scripts/buildHistdataM1.js (données HistData 2010-2022).`); process.exit(1); }
    out.push({ src: 'hist', days: buildSessions(readGz(f)), keep: (d) => d.dayNum * 86400000 < Y(2023) });
  }
  out.push({ src: 'broker', days: buildSessions(readGz(`data/real-m1-full/${sym}.csv.gz`)), keep: (d) => d.dayNum * 86400000 >= Y(2023) && (!DRY || d.dayNum * 86400000 < Date.UTC(2023, 3, 1)) });
  return out;
}

/** Trades de chaque jambe, avec la volatilité journalière sur 14 séances (dimensionnement du compte pour B et C). */
function tradesFor(sym, sources, spreadMult) {
  const spreadAt = (p) => spreadMult * (DEFAULT_SPREADS[sym] ?? 0) * p / refPrice(sym);
  const res = { orb: [], noise: [], lasthalf: [] };
  const counts = { orb: 0, noise: 0, lasthalf: 0, days: 0 };
  for (const { days, keep } of sources) {
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      if (!keep(d)) continue;
      counts.days++;
      const vol = dailyVol(days, i);
      const tag = (t) => ({ ...t, symbol: sym, day: d.date, vol });
      const a = orbTrade(d, spreadAt); if (a) res.orb.push(tag(a));
      for (const b of noiseTrades(days, i, spreadAt)) res.noise.push(tag(b));
      if (i > 0) { const c = lastHalfHourTrade(d, days[i - 1].close, spreadAt); if (c) res.lasthalf.push(tag(c)); }
    }
  }
  for (const k of ['orb', 'noise', 'lasthalf']) counts[k] = res[k].length;
  return { res, counts };
}

const stats = (vals) => { const n = vals.length, s = vals.reduce((a, x) => a + x, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(vals.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? vals.filter((x) => x > 0).length / n * 100 : 0 }; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const inP = (p) => (t) => t.entryTime >= p.from && t.entryTime < p.to;
const unit = (leg) => (leg.strat === 'orb' ? 'R' : '%');

/** Part du solde gagnée/perdue par un trade selon le dimensionnement : A = risque fixe (levier plafonné à 4x), B/C = cible de volatilité (plafond 4x). */
function fraction(leg, t, size) {
  if (leg.strat === 'orb') return Math.min(size / 100, 4 * t.R / t.fill) * t.r;
  if (!(t.vol > 0)) return null;
  return Math.min(4, (size / 100) / t.vol) * t.ret;
}

/** Compte événementiel (entrée à l'exécution, P&L à la sortie), garde-fou du bot, FTMO 1-Step enchaîné si ftmo. */
function simulate(leg, trades, size, ftmo) {
  const list = trades.map((t) => ({ t, f: fraction(leg, t, size) })).filter((x) => x.f !== null);
  const evs = [];
  list.forEach((x, i) => { evs.push({ time: x.t.entryTime, kind: 1, i }); evs.push({ time: Math.max(x.t.exitTime, x.t.entryTime), kind: 0, i }); });
  evs.sort((a, b) => a.time - b.time || b.kind - a.kind);
  const guard = ftmo ? buildEffectiveConfig({ id: 'intraday', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: 0.5 }).guardrails : CONFIG.guardrails;
  const cycles = []; let c = null;
  const start = (time) => { const g = new GuardrailEngine({ ...guard }); g.setBalance(START, time); c = { start: time, g, bal: START, peak: START, dd: 0, open: new Map(), n: 0 }; };
  start(evs.length ? evs[0].time : 0);
  for (const ev of evs) {
    const { t, f } = list[ev.i];
    if (ev.kind === 1) { if (t.entryTime >= c.start && c.open.size === 0 && c.g.canTakeNewTrade(t.entryTime, t.symbol)) c.open.set(ev.i, c.bal); continue; }
    if (!c.open.has(ev.i)) continue;
    const pnl = c.open.get(ev.i) * f; c.open.delete(ev.i);
    c.bal += pnl; c.n++; c.peak = Math.max(c.peak, c.bal); c.dd = Math.max(c.dd, (c.peak - c.bal) / c.peak * 100);
    c.g.recordTrade({ pnl, time: t.exitTime, balanceAfter: c.bal, symbol: t.symbol });
    if (!ftmo) continue;
    const st = c.g.getStatus(t.exitTime, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) { cycles.push({ ...c, end: t.exitTime, out: st.targetReached ? 'RÉUSSI' : 'RATÉ' }); start(t.exitTime); }
  }
  cycles.push({ ...c, out: 'en cours' });
  return { ret: (cycles[0].bal - START) / START * 100, dd: Math.max(...cycles.map((x) => x.dd)), pass: cycles.filter((x) => x.out === 'RÉUSSI').length, fail: cycles.filter((x) => x.out === 'RATÉ').length, cur: (c.bal - START) / START * 100 };
}

function main() {
  const t0 = Date.now();
  const bySym = {}, bySym2x = {}, counts = {};
  for (const sym of SYMBOLS) {
    const sources = loadDays(sym);
    const base = tradesFor(sym, sources, 1);
    bySym[sym] = base.res; counts[sym] = base.counts;
    if (!DRY) bySym2x[sym] = tradesFor(sym, sources, 2).res;
    console.error(`${sym} : ${base.counts.days} séances, ORB ${base.counts.orb}, noise ${base.counts.noise}, dernière demi-heure ${base.counts.lasthalf} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  if (DRY) { console.log('DRY : chaîne vérifiée (nombres de trades seulement, aucun résultat lu).'); return; }
  const legTrades = (leg, src = bySym) => src[leg.sym][leg.strat];

  const md = ['# Momentum intraday publié sur US100 / US500 — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-intraday-momentum-2026-09-23.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runIntradayMomentumStudy.js` (règles dans `scripts/lib/intradayMomentum.js`, testées). A en R par trade ; B et C en rendement net par trade, % du nominal. Réglé à la minute, bid + spread par défaut au niveau de prix, pas de swap.', '',
    '## Séances et trades', '', ...SYMBOLS.map((s) => `- ${s} : ${counts[s].days} séances ; A ${counts[s].orb} trades, B ${counts[s].noise}, C ${counts[s].lasthalf}`), '',
    '## Critère pré-enregistré (jambes principales)', '', '| Jambe | Entraînement : trades, moyenne, t | 2010-2016 | 2017-2022 | Test 2023-2025 : trades, moyenne | Verdict |', '|---|---|---|---|---|---|'];
  const verdicts = [];
  for (const leg of LEGS.filter((l) => l.primary)) {
    const all = legTrades(leg);
    const tr = stats(all.filter(inP(PERIODS[0])).map((t) => valueOf(leg, t)));
    const hv = HALVES.map(([a, b]) => stats(all.filter((t) => t.entryTime >= a && t.entryTime < b).map((t) => valueOf(leg, t))));
    const te = stats(all.filter(inP(PERIODS[1])).map((t) => valueOf(leg, t)));
    const trainOk = tr.n >= 60 && tr.m > 0 && tr.t >= 2 && hv.every((h) => h.s > 0);
    const verdict = !trainOk ? 'ÉCHEC à l\'entraînement' : te.n >= 30 && te.m > 0 ? '**CANDIDATE** (démo/alerte d\'abord)' : 'ÉCHEC au test';
    verdicts.push({ leg, verdict, candidate: verdict.includes('CANDIDATE') });
    const u = unit(leg);
    md.push(`| ${leg.label} | ${tr.n}, ${sgn(tr.m, 3)} ${u}, t ${tr.t.toFixed(2)} | ${sgn(hv[0].s)} ${u} | ${sgn(hv[1].s)} ${u} | ${te.n}, ${sgn(te.m, 3)} ${u} (total ${sgn(te.s)}) | ${verdict} |`);
  }

  md.push('', '## Toutes les jambes par période (moyenne par trade, total, t) — contrôles de robustesse compris', '', '| Jambe | Période | Trades | Gagnants | Moyenne | Total | t | Total à 2 × spread |', '|---|---|---|---|---|---|---|---|');
  for (const leg of LEGS) for (const p of PERIODS) {
    const s = stats(legTrades(leg).filter(inP(p)).map((t) => valueOf(leg, t)));
    const s2 = stats(legTrades(leg, bySym2x).filter(inP(p)).map((t) => valueOf(leg, t)));
    const u = unit(leg);
    md.push(`| ${leg.id} | ${p.label} | ${s.n} | ${s.win.toFixed(0)} % | ${sgn(s.m, 3)} ${u} | ${sgn(s.s)} ${u} | ${s.t.toFixed(2)} | ${sgn(s2.s)} ${u} (t ${s2.t.toFixed(2)}) |`);
  }

  md.push('', '## Par année (jambes principales, total)', '', `| Année | ${LEGS.filter((l) => l.primary).map((l) => l.id).join(' | ')} |`, `|---|${LEGS.filter((l) => l.primary).map(() => '---').join('|')}|`);
  for (let y = 2010; y <= 2026; y++) {
    const cells = LEGS.filter((l) => l.primary).map((leg) => { const s = stats(legTrades(leg).filter((t) => t.entryTime >= Y(y) && t.entryTime < Y(y + 1)).map((t) => valueOf(leg, t))); return `${sgn(s.s)} ${unit(leg)} (${s.n})`; });
    md.push(`| ${y} | ${cells.join(' | ')} |`);
  }

  md.push('', '## Compte 10 000 $ et FTMO 1-Step (descriptif, jambes principales)', '', 'A : risque par trade (levier plafonné à 4x). B et C : cible de volatilité journalière (nominal = capital × min(4, cible / σ14)). Garde-fou du bot (3 trades/jour, pause 30 min, −2 %/jour), une position à la fois.', '', '| Jambe | Taille | Période | Compte continu | Pire baisse | FTMO réussis / ratés |', '|---|---|---|---|---|---|');
  for (const leg of LEGS.filter((l) => l.primary)) {
    const sizes = leg.strat === 'orb' ? [0.25, 0.5, 1] : [0.5, 1, 2];
    for (const size of sizes) for (const p of PERIODS) {
      const tr = legTrades(leg).filter(inP(p));
      const cont = simulate(leg, tr, size, false), f = simulate(leg, tr, size, true);
      md.push(`| ${leg.id} | ${size} %${leg.strat === 'orb' ? ' risque' : ' vol'} | ${p.label} | ${sgn(cont.ret)} % | ${cont.dd.toFixed(1)} % | ${f.pass} / ${f.fail} (en cours ${sgn(f.cur)} %) |`);
    }
  }
  md.push('', '## Verdict', '', ...verdicts.map((v) => `- ${v.leg.label} : ${v.verdict}`), '',
    verdicts.some((v) => v.candidate) ? 'Au moins une candidate : suivi en démo / alerte avant tout argent réel (pré-enregistrement).' : 'Aucune candidate : on n\'ajoute pas de filtres pour faire passer ces stratégies (pré-enregistrement).',
    '', '## Limites', '', '- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement (sensibilité à 2 × le spread ci-dessus).', '- B : VWAP remplacé par la moyenne des prix typiques (pas de volume) ; stops seulement aux contrôles de demi-heure.', '- CFD ≠ ETF de l\'article (QQQ/SPY) ; 3 jambes principales testées (≈ 7 % de chances qu\'une passe par hasard).');
  const out = 'data/backtest-input/intraday-momentum-study.md';
  fs.writeFileSync(out, md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
