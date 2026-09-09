// Central config for the ICT-FVG trading assistant.
// These mirror exactly what the user chose during setup.
//
// 2026-09: added XAUUSD's filtered-FVG config, and the price-action
// Divergence (US100/US500 log-ratio pairs mean-reversion) config, so the
// live/demo bot can be wired to the SAME validated combo already proven in
// scripts/runFtmo1StepAccountImpact.js (see HANDOFF.md "Câbler le bot live").
// EURUSD/GBPUSD stay excluded: neither the FVG grid nor the Divergence
// mechanism (re-tested 2026-09, see data/backtest-input/
// divergence-eurusd-gbpusd-analysis.md) held up out-of-sample for that pair.
// Every value below is copied VERBATIM from the already-validated backtest
// script, not re-tuned here.

// Silver Bullet (US100, US500) and London-NY overlap (XAUUSD) session
// windows, in NY local hours — see scripts/runFtmo1StepAccountImpact.js.
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };

export const CONFIG = {
  symbols: ['US100', 'US500', 'XAUUSD'],
  timeframe: 'M15',
  risk: {
    riskPctPerTrade: 0.5,
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
        sessionWindow: SILVER_BULLET_WINDOW,
        liquiditySweepEnabled: true,
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
