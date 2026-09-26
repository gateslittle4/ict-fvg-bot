#!/usr/bin/env node
// runVolRegimeStep0.js - étape 0 de l'hypothèse « le robot ne gagne qu'en marché agité » (échange avec Gemini, 2026-09-26).
// Descriptif, sur l'ENTRAÎNEMENT 2011-2022 seulement. Règles fixées AVANT de lire les chiffres (écrites ici, commitées avec le résultat) :
//   - Trades : rejeu fidèle du bot complet (combo + A + B + RSI(2)), tranches data/live-replay/hist-{2010-2014,2014-2017,2017-2020,2020-2023}.json
//     (régénérées avec le code du 26/09). Entrées de 2011-2022 seulement.
//   - Volatilité de chaque trade : ATR14 journalier de SA paire / moyenne simple des 100 ATR14 précédents, mesurée sur les jours COMPLETS
//     avant le jour d'entrée (aucun regard vers l'avant). Jours moteur (minuit EST fixe) ; un jour de moins de 600 minutes de données
//     (dimanche soir, jour férié) est ignoré. Seuils de la convention du projet, jamais retouchés : calme < 0,8 ; agité > 1,5 ; normal entre.
//   - L'hypothèse SURVIT à l'étape 0 si, dans CHACUNE des deux moitiés (2011-2016 et 2017-2022), le R moyen des trades en régime calme est
//     ≤ 0 ET celui des autres trades (normal + agité) est > 0. Sinon elle tombe (pas de pré-enregistrement du filtre).
//   - Aussi (descriptif) : part des jours de bourse passés dans chaque régime, par période, 2011 → 2026 (US500 et US100).
// Usage : node --max-old-space-size=6144 scripts/runVolRegimeStep0.js  -> data/backtest-input/vol-regime-step0.md
import fs from 'node:fs';
import { eng, loadM1, readCsvGz, lower, DAY } from './lib/m1Data.js';

const LOW = 0.8, HIGH = 1.5, MIN_MINUTES = 600;
const TR = ['hist-2010-2014', 'hist-2014-2017', 'hist-2017-2020', 'hist-2020-2023'];
const trades = TR.flatMap((f) => JSON.parse(fs.readFileSync(`data/live-replay/${f}.json`, 'utf8')).trades)
  .filter((t) => t.entryTime >= eng(2011) && t.entryTime < eng(2023) && Number.isFinite(t.r));

/** Ratio ATR14 / SMA100(ATR14) valable pour chaque jour (calculé sur les jours complets d'avant). */
function dailyRatios(S) {
  const days = [];
  let cur = null;
  for (let i = 0; i < S.n; i++) {
    const d = Math.floor(S.t[i] / DAY);
    if (!cur || cur.d !== d) { if (cur) days.push(cur); cur = { d, h: S.h[i], l: S.l[i], c: S.c[i], m: 0 }; }
    if (S.h[i] > cur.h) cur.h = S.h[i];
    if (S.l[i] < cur.l) cur.l = S.l[i];
    cur.c = S.c[i]; cur.m++;
  }
  if (cur) days.push(cur);
  const full = days.filter((x) => x.m >= MIN_MINUTES);
  const atr = []; const ratioAfter = new Map(); // jour complet k -> ratio connu à la fin de ce jour
  for (let k = 1; k < full.length; k++) {
    const p = full[k - 1], x = full[k];
    atr.push(Math.max(x.h - x.l, Math.abs(x.h - p.c), Math.abs(x.l - p.c)));
    if (atr.length < 14 + 100) continue;
    const a14 = (j) => atr.slice(j - 13, j + 1).reduce((s, v) => s + v, 0) / 14;
    const last = atr.length - 1;
    const now = a14(last);
    let sma = 0; for (let j = last - 100; j < last; j++) sma += a14(j);
    ratioAfter.set(x.d, now / (sma / 100));
  }
  const known = [...ratioAfter.keys()].sort((a, b) => a - b);
  // ratio utilisable pendant le jour d : celui du dernier jour complet STRICTEMENT avant d
  const at = (d) => { const i = lower(known, known.length, d) - 1; return i >= 0 ? ratioAfter.get(known[i]) : null; };
  return { at, fullDays: full.map((x) => x.d) };
}

const regime = (r) => (r == null ? null : r < LOW ? 'calme' : r > HIGH ? 'agité' : 'normal');
const R = {};
for (const sym of ['US100', 'US500']) {
  const hist = readCsvGz(`data/histdata-m1/${sym}.csv.gz`);
  const broker = loadM1('broker', sym);
  R[sym] = { hist: dailyRatios(hist), broker: dailyRatios(broker) };
}
const ratioFor = (sym, t) => { const d = Math.floor(t / DAY); return (t < eng(2023) ? R[sym].hist : R[sym].broker).at(d); };

const st = (l) => {
  const n = l.length, s = l.reduce((a, x) => a + x.r, 0), m = n ? s / n : 0;
  const sd = n > 1 ? Math.sqrt(l.reduce((a, x) => a + (x.r - m) ** 2, 0) / (n - 1)) : 0;
  return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0 };
};
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const HALVES = [['2011-2016', eng(2011), eng(2017)], ['2017-2022', eng(2017), eng(2023)]];
for (const t of trades) t.regime = regime(ratioFor(t.symbol, t.entryTime));
const unknown = trades.filter((t) => !t.regime).length;

const md = ['# Étape 0 — le robot ne gagne-t-il qu\'en marché agité ? (entraînement 2011-2022)', '',
  'Règles fixées avant lecture : voir l\'en-tête de `scripts/runVolRegimeStep0.js`. Rejeu fidèle du bot complet (combo + A + B + RSI(2)), R net de spread et swap. Régime = ATR14 journalier de la paire / moyenne des 100 ATR14 précédents, mesuré avant le jour d\'entrée : calme < 0,8, agité > 1,5.', '',
  `${trades.length} trades 2011-2022 (${unknown} sans ratio : début d'historique, exclus du classement).`, '',
  '## R par trade selon le régime', '', '| Période | Régime | Trades | R moyen | R total | t |', '|---|---|---|---|---|---|'];
const verdictParts = [];
for (const [lab, a, b] of HALVES) {
  const P = trades.filter((t) => t.regime && t.entryTime >= a && t.entryTime < b);
  for (const g of ['calme', 'normal', 'agité']) { const s = st(P.filter((t) => t.regime === g)); md.push(`| ${lab} | ${g} | ${s.n} | ${sgn(s.m, 3)} | ${sgn(s.s)} | ${s.t.toFixed(2)} |`); }
  const calm = st(P.filter((t) => t.regime === 'calme')), rest = st(P.filter((t) => t.regime !== 'calme'));
  md.push(`| ${lab} | **normal + agité** | ${rest.n} | ${sgn(rest.m, 3)} | ${sgn(rest.s)} | ${rest.t.toFixed(2)} |`);
  verdictParts.push({ lab, ok: calm.m <= 0 && rest.m > 0, calm, rest });
}
md.push('', '## Par stratégie (R moyen calme / normal + agité, 2011-2022)', '', '| Stratégie | Calme : trades, R moyen | Normal + agité : trades, R moyen |', '|---|---|---|');
for (const key of [...new Set(trades.map((t) => `${t.source} ${t.symbol}`))].sort()) {
  const T = trades.filter((t) => t.regime && `${t.source} ${t.symbol}` === key);
  const c = st(T.filter((t) => t.regime === 'calme')), o = st(T.filter((t) => t.regime !== 'calme'));
  md.push(`| ${key} | ${c.n}, ${sgn(c.m, 3)} | ${o.n}, ${sgn(o.m, 3)} |`);
}
md.push('', '## Part des jours de bourse dans chaque régime (descriptif)', '', '| Période | Paire | Calme | Normal | Agité |', '|---|---|---|---|---|');
for (const [lab, a, b] of [['2011-2016', 2011, 2017], ['2017-2022', 2017, 2023], ['2023-2025', 2023, 2026], ['2026 (→ 21/09)', 2026, 2027]]) {
  for (const sym of ['US500', 'US100']) {
    const src = a < 2023 ? R[sym].hist : R[sym].broker;
    const days = src.fullDays.filter((d) => d * DAY >= eng(a) && d * DAY < eng(b)).map((d) => regime(src.at(d))).filter(Boolean);
    const pc = (g) => `${Math.round((100 * days.filter((x) => x === g).length) / (days.length || 1))} %`;
    md.push(`| ${lab} | ${sym} | ${pc('calme')} | ${pc('normal')} | ${pc('agité')} |`);
  }
}
const survit = verdictParts.every((v) => v.ok);
md.push('', '## Verdict de l\'étape 0 (règle fixée avant lecture)', '',
  ...verdictParts.map((v) => `- ${v.lab} : calme ${sgn(v.calm.m, 3)} R/trade (${v.calm.n}), normal + agité ${sgn(v.rest.m, 3)} R/trade (${v.rest.n}) → ${v.ok ? 'conforme' : 'NON conforme'}`),
  '', survit ? '**L\'hypothèse SURVIT** : calme ≤ 0 et reste > 0 dans les deux moitiés. Étape suivante : pré-enregistrer le filtre (seuil 0,8 figé) et le faire tourner en mode fantôme.'
    : '**L\'hypothèse TOMBE** : la condition n\'est pas remplie dans les deux moitiés. Pas de filtre de volatilité à pré-enregistrer.', '');
fs.writeFileSync('data/backtest-input/vol-regime-step0.md', md.join('\n') + '\n');
console.log(md.join('\n'));
