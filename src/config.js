// Central config for the ICT-FVG trading assistant.
// These mirror exactly what the user chose during setup.
//
// 2026-09: added XAUUSD's filtered-FVG config, and the price-action
// Divergence (US100/US500 log-ratio pairs mean-reversion) config, so the
// live/demo bot can be wired to the SAME validated combo already proven in
// scripts/runFtmo1StepAccountImpact.js (see HANDOFF.md "Câbler le bot live").
// GBPUSD stays excluded: neither the FVG grid nor the Divergence mechanism
// (re-tested 2026-09, see data/backtest-input/
// divergence-eurusd-gbpusd-analysis.md) held up out-of-sample for that pair,
// and no other concept tested on it has held up either. EURUSD is now
// traded too, but ONLY via Judas Swing (see the `judasSwing` block below) -
// the FVG grid and Divergence mechanism never held up on it either, same as
// GBPUSD.
// Every value below is copied VERBATIM from the already-validated backtest
// script, not re-tuned here.

// Silver Bullet (US500) and London-NY overlap (XAUUSD) session windows, in
// NY local hours — see scripts/runFtmo1StepAccountImpact.js.
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
// US100-specific window — see that symbol's own config below for why it's
// no longer SILVER_BULLET_WINDOW.
const US100_WINDOW = { startHour: 8, endHour: 12 };

// ACCOUNT_MODE (2026-09, Esdras: "on ne peut pas avoir les mêmes codages
// pour le challenge et le live" - see HANDOFF.md): the ONE thing that
// actually needs to differ between a challenge attempt and a funded live
// account is the risk per trade. A challenge only costs a re-purchase fee
// on bust and has an explicit +10% target to reach fast, so the validated
// 0.5%/trade (fast: ~63 days average to pass, per
// runFtmoAllLiveStrategiesCycleAccountImpact.js) makes sense there. A LIVE
// account has no target to rush toward and a bust there means losing the
// real funded account, so the same simulation's 0.3%/trade result (0%
// busts across every cycle tested, at the cost of a slower pace - moot
// once live, since there's no challenge clock to beat) is the live default
// instead. Everything else (RR, windows, guardrails, which sources are
// live) stays IDENTICAL between the two modes - not asked for, not changed
// here.
// Set via Render env var (ACCOUNT_MODE=challenge|live) - same durable,
// restart-survives pattern as RISK_PCT_PER_TRADE below, not a dashboard
// toggle (this changes position sizing, not something to flip casually
// mid-session). Defaults to 'challenge' (today's actual state).
export const ACCOUNT_MODES = ['challenge', 'live'];
const DEFAULT_RISK_PCT_BY_MODE = { challenge: 0.5, live: 0.3 };
function resolveAccountMode() {
  const raw = (process.env.ACCOUNT_MODE || '').toLowerCase();
  return ACCOUNT_MODES.includes(raw) ? raw : 'challenge';
}
const ACCOUNT_MODE = resolveAccountMode();

// RISK_PCT_PER_TRADE (2026-09, opt-in, "page réglages" - see HANDOFF.md):
// the validated backtest value is 0.5 (or 0.3 in 'live' mode, see
// ACCOUNT_MODE above) - that per-mode value is the DEFAULT below. This env
// var, when explicitly set, OVERRIDES that default durably (survives a
// restart, same pattern as AUTO_EXECUTE_ALWAYS_ON) regardless of
// ACCOUNT_MODE - set it via Render when the user explicitly asks for a
// specific permanent risk % rather than the mode's own default. The
// dashboard's own settings card can ALSO change it live for the running
// process (POST /api/settings/risk, see server.js) - that takes effect
// immediately but reverts to whichever value boots next (this env var, or
// the mode default if unset) on the next restart, exactly like the
// auto-execute toggle's own "pause vs durable default" distinction.
// Clamped to a sane range - a fat-fingered/misconfigured value here sizes
// EVERY live position, so this is not a place to trust blindly.
// Exported so the live setter (store.js's setRiskPctPerTrade(), used by
// POST /api/settings/risk) enforces the SAME bounds rather than a second
// hardcoded pair of numbers that could drift from this one.
export const MIN_RISK_PCT = 0.05;
export const MAX_RISK_PCT = 2;
function resolveRiskPctPerTrade() {
  const raw = Number(process.env.RISK_PCT_PER_TRADE);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RISK_PCT_BY_MODE[ACCOUNT_MODE];
  return Math.min(Math.max(raw, MIN_RISK_PCT), MAX_RISK_PCT);
}

export const CONFIG = {
  symbols: ['US100', 'US500', 'XAUUSD', 'EURUSD'],
  timeframe: 'M15',
  accountMode: ACCOUNT_MODE, // 'challenge' | 'live' - see ACCOUNT_MODE comment above
  risk: {
    riskPctPerTrade: resolveRiskPctPerTrade(),
  },
  guardrails: {
    maxTradesPerDay: 2,
    cooldownMinutesAfterLoss: 30,
    dailyLossLimitPct: 2,
    dayBoundaryHourUTC: 0,
  },
  fvg: {
    maxAgeCandles: 50,
    // Per-symbol filtered-FVG config, identical to FVG_CONFIG in
    // scripts/runFtmo1StepAccountImpact.js — the exact combo validated
    // train(2019-2023)/test(2024-2025). Consumed by buildFilteredEngine()
    // via src/liveStrategyEngine.js, NOT by a raw FvgEngine.
    perSymbol: {
      US100: {
        variant: 'H4_EMA200',
        stopMode: 'fvg-edge',
        // 2026-09: cible étendue à 1:5 (au lieu de 1:3) — voir HANDOFF.md
        // "Cible étendue (1:4/1:5)" et data/backtest-input/
        // extended-target-analysis.md. Même signaux/entrées/stops déjà
        // validés, seul ce multiple change : espérance train 0.79R→1.38R,
        // test 0.70R→1.44R, amélioration MONOTONE et confirmée année par
        // année (2019-2025), drawdown max identique (5.79R/5.40R) quel que
        // soit le RR choisi. À valider par un forward-test démo avant
        // d'engager du capital réel dessus (un seul découpage historique).
        rrMultiple: 5,
        structureEnabled: true,
        sessionEnabled: true,
        // 2026-09: élargi de 10h-11h (Silver Bullet) à 8h-12h — décision
        // explicite d'Esdras ("on part sur 8h-12h, c'est notre décision
        // pour finir le challenge plus rapidement"), après comparaison
        // complète des deux fenêtres : voir HANDOFF.md "8h-12h n'est-il pas
        // un meilleur compromis ?" et les fichiers data/backtest-input/
        // ftmo-1step-us100-only-8to12-account-impact.md /
        // fvg-multi-touch-window-weekday-analysis.md. Résumé du compromis
        // accepté : ~46% plus rapide pour passer un challenge FTMO (test
        // 2024-2025 : ~90 jours au lieu de ~167), jamais busté sur 7 ans de
        // backtest, mais drawdown trailing max plus élevé (9.3% au pire cas
        // contre 4.7% pour 10h-11h — toujours sous le plafond FTMO de 10%,
        // avec moins de marge). US500 reste sur SILVER_BULLET_WINDOW
        // (10h-11h) — cette fenêtre élargie n'a été testée et validée QUE
        // pour US100.
        sessionWindow: US100_WINDOW,
        liquiditySweepEnabled: true,
        // 2026-09: "multi-contact" - voir HANDOFF.md "FVG 'multi-contact'
        // testé..." et les vérifications qui ont suivi. Un contact qui rate
        // les filtres (biais/structure/session/sweep) ne détruit plus la
        // zone (contrairement au FvgEngine standard) - elle reste active
        // pour un contact ULTÉRIEUR, jusqu'à maxAgeCandles. Validé sur
        // US100 SEULEMENT (3 vérifications de robustesse indépendantes :
        // pas un seul trimestre chanceux, le sens contre-tendance tient
        // aussi, ~10x une référence d'entrée arbitraire - ni EURUSD ni
        // GBPUSD ne tiennent sur ce concept, USDJPY tient mécaniquement
        // mais s'est révélé fragile à l'examen). Combiné avec le
        // pyramidage (`CONFIG.pyramid`, toujours derrière PYRAMID_ENABLED)
        // et vérifié ensemble dans une simulation de compte FTMO complète
        // (jamais busté sur 7 ans, voir data/backtest-input/
        // ftmo-1step-us100-only-pyramid-account-impact.md) avant d'activer
        // ce champ. `LiveStrategyEngine._buildFvgEngine()` lit ce champ.
        multiTouch: true,
      },
      US500: {
        variant: 'H1_EMA50',
        stopMode: 'fvg-edge',
        // 2026-09: cible étendue à 1:5 — même logique/source que US100
        // ci-dessus. Espérance train 0.63R→1.02R, test 0.70R→1.13R ; le
        // saut de drawdown (7.03R→8.96R train) se produit déjà en passant
        // à 1:4, pas entre 1:4 et 1:5 — le gain d'espérance de 1:4 à 1:5
        // ne coûte donc rien de plus en risque.
        rrMultiple: 5,
        structureEnabled: true,
        sessionEnabled: true,
        sessionWindow: SILVER_BULLET_WINDOW,
        liquiditySweepEnabled: true,
      },
      XAUUSD: {
        variant: 'H4_EMA20',
        stopMode: 'swing',
        // 2026-09: cible étendue à 1:4 SEULEMENT (pas 1:5, contrairement à
        // US100/US500 ci-dessus) — voir même source. XAUUSD est le seul des
        // trois où 1:5 redonne du terrain en test (0.61R→0.52R) ET aggrave
        // nettement le drawdown max (train 6.80R→8.04R, test 6.20R→9.27R).
        // 1:4 est le point d'équilibre identifié pour cet instrument.
        rrMultiple: 4,
        structureEnabled: true,
        sessionEnabled: true,
        sessionWindow: LONDON_NY_OVERLAP_WINDOW,
        liquiditySweepEnabled: true,
      },
    },
  },
  // Price-action Divergence (log-ratio z-score pairs mean-reversion,
  // US100 vs US500 only) — identical to the DIV_* constants in
  // scripts/runFtmo1StepAccountImpact.js.
  divergence: {
    pair: ['US100', 'US500'],
    lookback: 100,
    zThreshold: 2,
    atrPeriod: 14,
    stopAtrMultiple: 1.5,
    rrMultiple: 3,
    maxHoldingM15Candles: 480,
  },
  // NWOG (New Week Opening Gap) - LIVE, auto-executed (2026-09). Started as
  // an alert-only observation phase, then moved straight to full
  // auto-execute at the user's explicit, eyes-open request: "je vais pas
  // avoir le temps pour trader ... rend tout automatique" (see HANDOFF.md
  // for the full exchange, including the risk tradeoffs explicitly named
  // before she confirmed). Backtested credible on US100 specifically: train
  // 0.15R (n=224), test 0.34R (n=90, BETTER than train), and confirmed again
  // independently on the 2026 forward-test data (n=30, 0.28R - squarely
  // between train/test, ~10x FVG's own trade count on the same window).
  // Scoped to US100 ONLY - the other 4 instruments were weaker/rejected on
  // this same concept, see data/backtest-input/nwog-strategy-analysis.md.
  //
  // Wired into the SAME openPositions/netting/auto-execute path as FVG and
  // Divergence (liveStrategyEngine.js's _processNwogCandidate) - no
  // special-cased position tracking left. A signal fires roughly weekly
  // (the weekend gap), so the practical exposure/monitoring burden is low
  // even though there is no manual review step before an order is placed.
  nwog: {
    symbols: ['US100'],
    rrMultiple: 3, // same convention already validated in src/backtest/nwog.js - not re-tuned here
    maxHoldingM15Candles: 480,
  },
  // Judas Swing (ICT London killzone PDH/PDL sweep+reclaim) - LIVE,
  // auto-executed (2026-09), at the user's explicit request ("on active
  // Judas Swing") after being shown the trade-off: EURUSD held up 6 of 8
  // years (train exp=0.04R n=532, test exp=0.15R n=163), modest but real,
  // and - unlike every other live source - on an instrument with NO other
  // strategy competing for it (no netting dilution, a genuine addition to
  // trade frequency). US100 also technically "tient" on this concept but
  // its edge decays year over year (see HANDOFF.md "Résultats MITIGÉS") and
  // already has FVG/Divergence/NWOG live on it, so it's deliberately left
  // OUT here - EURUSD is the one instrument where this concept is both
  // credible AND additive. GBPUSD/US500/XAUUSD were weaker or rejected on
  // this same concept, see data/backtest-input/judas-swing-strategy-analysis.md.
  //
  // Wired into the SAME openPositions/netting/auto-execute path as FVG,
  // Divergence and NWOG (liveStrategyEngine.js's _processJudasSwingCandidate)
  // - no special-cased position tracking. Default London killzone window
  // (02:00-05:00 NY) from src/backtest/judasSwing.js is used as-is.
  judasSwing: {
    symbols: ['EURUSD'],
    rrMultiple: 3, // same convention already validated in src/backtest/judasSwing.js - not re-tuned here
    maxHoldingM15Candles: 480,
  },
  // Pyramid add-on ("stops indépendants, sans breakeven" - see HANDOFF.md):
  // once an FVG position on `symbols` has moved `addAtR` in its favor, place
  // a SECOND, fully independent unit (own entry/stop/target - the original
  // position's own stop is NEVER touched). `enabled: false` is the kill
  // switch - nothing below fires unless this is explicitly flipped to true
  // (e.g. via PYRAMID_ENABLED=true), on top of `broker` already having full
  // trade-scope credentials. Scoped to the two instruments this was actually
  // backtested on (see scripts/runPyramidIndependentAccountImpact.js) -
  // deliberately NOT applied to XAUUSD or to Divergence-sourced trades,
  // neither of which this design was ever validated against.
  pyramid: {
    enabled: process.env.PYRAMID_ENABLED === 'true',
    addAtR: 1,
    symbols: ['US100', 'US500'],
  },
  notifications: {
    // ntfy.sh topic - set NTFY_TOPIC env var to a private, hard-to-guess topic name.
    // Subscribe to it in the ntfy app (iOS/Android) or at https://ntfy.sh/<topic> to
    // receive validated-entry pushes on your phone. Leave unset to disable push.
    ntfyTopic: process.env.NTFY_TOPIC || null,
  },
  broker: {
    // cTrader Open API - ABANDONED 2026-09-07 in favor of Match-Trader (see
    // HANDOFF.md "Prochaines étapes" #1: waiting on a third-party Spotware
    // app approval was the blocker). Left wired for completeness/rollback,
    // not the active path. See docs/CTRADER_SETUP.md.
    clientId: process.env.CTRADER_CLIENT_ID || null,
    clientSecret: process.env.CTRADER_CLIENT_SECRET || null,
    accessToken: process.env.CTRADER_ACCESS_TOKEN || null,
    accountId: process.env.CTRADER_ACCOUNT_ID || null,

    // Match-Trader Platform API (FundingPips) - the active path since
    // 2026-09-07. brokerId/platformUrl are FundingPips-specific values that
    // must come from their support (see docs/MATCHTRADER_SETUP.md) - no
    // public documentation lists them, unlike email/password which are the
    // user's own everyday Match-Trader login. `systemUuid` is a SEPARATE
    // unconfirmed value the mtr-api path segment needs (see
    // matchTraderDataSource.js file header) - left optional, falls back to
    // brokerId if unset; correct this once support/the first real API call
    // clarifies whether they're actually the same value.
    matchTrader: {
      email: process.env.MATCHTRADER_EMAIL || null,
      password: process.env.MATCHTRADER_PASSWORD || null,
      brokerId: process.env.MATCHTRADER_BROKER_ID || null,
      platformUrl: process.env.MATCHTRADER_PLATFORM_URL || null,
      systemUuid: process.env.MATCHTRADER_SYSTEM_UUID || null,
      accountId: process.env.MATCHTRADER_ACCOUNT_ID || null, // optional - picks a specific sub-account out of the login response if the user has more than one
    },
  },
};

/** Which broker platform to boot with, if any. Explicit override via
 * BROKER_PLATFORM=matchtrader|ctrader; otherwise whichever has full
 * credentials wins, preferring Match-Trader (the active path - see above)
 * when BOTH happen to be configured at once. */
export function getConfiguredPlatform() {
  const override = (process.env.BROKER_PLATFORM || '').toLowerCase();
  if (override === 'matchtrader' || override === 'ctrader') return override;

  const mt = CONFIG.broker.matchTrader;
  const matchTraderReady = Boolean(mt.email && mt.password && mt.brokerId && mt.platformUrl);
  if (matchTraderReady) return 'matchtrader';

  const ct = CONFIG.broker;
  // accountId is deliberately NOT required here (unlike matchTrader above) -
  // CTraderDataSource.start() can discover it via the access token when
  // unset (see pickAccountOrThrow() in cTraderDataSource.js), so the app
  // should still attempt a live connection with just these three.
  const cTraderReady = Boolean(ct.clientId && ct.clientSecret && ct.accessToken);
  if (cTraderReady) return 'ctrader';

  return null;
}

export function isLiveConfigured() {
  return getConfiguredPlatform() !== null;
}
