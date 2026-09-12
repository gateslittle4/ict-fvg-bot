// goatFundedTrader.js
// GoatFundedTrader's 1-Step program. Originally sourced in
// data/backtest-input/prop-firm-1step-comparison.md (checked against
// help.goatfundedtrader.com in early September 2026), then RE-VERIFIED
// directly (2026-09-12, at Esdras's explicit request "tu as les règles des
// prop firm pour vrai?") by fetching GoatFundedTrader's OWN help article
// (https://help.goatfundedtrader.com/en/articles/10630134-1-step-model) live
// - every number below CONFIRMED unchanged, including the 6% static max
// drawdown (a broader web search first turned up a conflicting "10%"
// figure from third-party aggregator sites, most likely mixing this up
// with a different firm/product - the firm's own article is authoritative
// here and settles it at 6%). Newer/less established firm than FTMO or
// FundingPips (post-2023) - no specific red flag found in that research,
// but less track record, so worth its own extra scrutiny (recent reviews,
// withdrawal proof) before funding a real account here. Re-verify before
// buying - rules and prices change.
//
// Shape: see propFirms/index.js's PROP_FIRM_PROGRAM_SHAPE comment for what
// every field means and how it's used (guardrails/target tracking).

export const GOATFUNDEDTRADER_1STEP = {
  id: 'goatfundedtrader-1step',
  firm: 'GoatFundedTrader',
  label: 'GoatFundedTrader 1-Step',
  phases: [
    {
      name: '1-Step',
      targetPct: 10,
      // The source found 4% for accounts bought before 2026-08-01, 3% for
      // accounts bought on/after that date - UNKNOWN here which applies to
      // any specific account, so the STRICTER (safer) value is used as the
      // default. Confirm against the real account's own terms and override
      // per-account if it turns out to be 4%.
      dailyLossLimitPct: 3,
      maxDrawdownPct: 6, // tightest of every program in this file - see the comparison doc
      maxDrawdownType: 'static',
      minTradingDays: 3,
      // Not just 3 days WITH a trade - 3 "winning" days, each with at least
      // 0.5% net gain that day. Not enforced/tracked anywhere yet (see
      // index.js's own note on what's actually enforced today).
      minTradingDayRule: 'winning-day-min-net-pct',
      minTradingDayMinNetPct: 0.5,
    },
  ],
  profitSplit: 0.8, // or 1.0 via a paid add-on, per the source
  timeLimitDays: null, // NOT confirmed either way - "à vérifier directement avec eux avant d'acheter"
  consistencyRule: null, // none found
  // Two more account-specific adjustments found, neither a "violation" per
  // the source (profit is reduced/capped, not blocked) - documented for the
  // record only, not enforced anywhere in this codebase today:
  weekendRule: 'profit-voided-if-position-spans-the-weekend-within-a-3h-window-each-side',
  newsRule: 'profit-capped-at-1pct-of-starting-balance-if-trade-opened-or-closed-within-5min-of-high-impact-news',
};

// GoatFundedTrader "Instant Premium Model" - instant-funded, NO evaluation
// phase at all (Esdras, 2026-09-12: "je veux vraiment pas aller dans un
// challenge"). Verified directly against the firm's own help article
// (https://help.goatfundedtrader.com/en/articles/16013484-instant-premium-model,
// live fetch, 2026-09-12) - same day as the 1-Step re-verification above.
//
// The one rule this program has that NO other program in this file has:
// floatingLossRule below is checked CONTINUOUSLY against UNREALIZED P&L on
// still-open positions (not just realized balance at trade close, like every
// maxDrawdownPct/dailyLossLimitPct check elsewhere) - closes the account
// PERMANENTLY the instant it's breached, even before any stop is actually
// hit. No script in this project measured this before
// scripts/runGoatFundedTraderFloatingLossAnalysis.js (2026-09-12).
export const GOATFUNDEDTRADER_INSTANT_PREMIUM = {
  id: 'goatfundedtrader-instant-premium',
  firm: 'GoatFundedTrader',
  label: 'GoatFundedTrader Instant Premium',
  phases: [
    {
      name: 'Instant Premium (financé direct)',
      targetPct: null, // instant-funded, no evaluation target
      dailyLossLimitPct: 3,
      maxDrawdownPct: 6,
      // Source: "trailing, on equity, never comes back down" - i.e. the
      // floor only ever ratchets UP as the account's real-time EQUITY
      // (balance + unrealized P&L on open positions, not just balance at
      // trade close) reaches new highs, checked continuously rather than
      // only at end-of-day. None of GuardrailEngine's 3 existing
      // maxDrawdownType values model floating-inclusive real-time equity -
      // scripts/runGoatFundedTraderFloatingLossAnalysis.js implements this
      // directly rather than force-fitting an existing type here.
      maxDrawdownType: 'trailing-realtime-equity-never-resets',
      minTradingDays: 5,
      // Not consecutive - 5 days total with at least 0.5% net gain each.
      minTradingDayRule: 'winning-day-min-net-pct',
      minTradingDayMinNetPct: 0.5,
    },
  ],
  profitSplit: 0.8,
  timeLimitDays: null,
  consistencyRule: null, // explicitly confirmed NONE ("Profits need not be evenly distributed across trading days")
  withdrawalCycleDays: 10,
  // The rule with no precedent anywhere else in this file (see file header
  // above). Two different thresholds depending on purchase date - since
  // TODAY is 2026-09-12 (after the cutoff), any account bought now is
  // subject to the STRICTER 1% figure; 1.5% is kept only for accounts
  // bought before the cutoff / for comparison.
  floatingLossRule: {
    thresholdPct: 1, // accounts bought ON/AFTER 2026-09-02 - the one that applies to a NEW purchase today
    thresholdPctLegacy: 1.5, // accounts bought BEFORE 2026-09-02
    cutoffDate: '2026-09-02',
    basis: 'unrealized-pnl-on-open-positions-vs-balance',
    consequence: 'permanent-account-closure',
    note: 'Checked at ANY moment, not just at trade close or day boundary - the account can be closed while a position is still open and before its stop is ever touched.',
  },
};

// GoatFundedTrader "Instant HERO Model" - a DIFFERENT instant-funded program
// from Instant Premium above, NOT the same thing under another name (Esdras,
// 2026-09-12, after Instant Premium's price came back too high: "test le
// instant hero model, il a beaucoup de règle, surtout le 15% consistency").
// Verified directly against the firm's own help article
// (https://help.goatfundedtrader.com/en/articles/16097387-instant-hero-model,
// live fetch, 2026-09-12).
//
// Same floating-loss mechanism as Instant Premium (see that program's own
// comment above) but at a flat 1% (no purchase-date split found for this
// program), a tighter 5% total drawdown (vs Instant Premium's 6%), and a
// REAL consistency rule (Instant Premium has none) - the one Esdras
// specifically asked to have tested. Source explicitly confirms it does
// NOT close the account or breach it - it only BLOCKS a payout request
// until the highest single day's profit share drops back under 15% of the
// period's total profit. Modeled by
// scripts/runGoatFundedTraderInstantHeroAnalysis.js as a rolling 14-
// calendar-day window (matching the payout cycle below) - the source
// doesn't specify the exact window used to evaluate the rule, so this is a
// documented assumption, not a confirmed mechanic.
export const GOATFUNDEDTRADER_INSTANT_HERO = {
  id: 'goatfundedtrader-instant-hero',
  firm: 'GoatFundedTrader',
  label: 'GoatFundedTrader Instant HERO',
  phases: [
    {
      name: 'Instant HERO (financé direct)',
      targetPct: null, // instant-funded, no evaluation target
      dailyLossLimitPct: 3, // "trailing of daily starting balance" - same daily-reset mechanic as every other program's dailyLossLimitPct
      maxDrawdownPct: 5,
      // Source: "trailing drawdown... adjusts upward with equity gains but
      // doesn't decrease with losses" - same real-time-equity mechanic as
      // Instant Premium's 6% (see that program's maxDrawdownType comment) -
      // NOT one of GuardrailEngine's 3 existing types, same fail-open
      // caveat applies (not enforced live today).
      // ADDITIONAL DETAIL Instant Premium's source didn't mention: this
      // floor "resets after each payout" - a real payout would periodically
      // lower the effective risk over a long-running account. NOT modeled
      // in the analysis script (exact payout timing is a trader decision,
      // not something the strategy alone determines) - the script's result
      // is therefore a conservative (worst-case, never-resets) estimate,
      // documented as such rather than guessed at.
      maxDrawdownType: 'trailing-realtime-equity-never-resets',
      minTradingDays: 6,
      minTradingDayRule: 'winning-day-min-net-pct',
      minTradingDayMinNetPct: 0.5,
    },
  ],
  profitSplit: 0.9, // or 1.0 via a paid add-on, per the source - better than Instant Premium's 80%
  timeLimitDays: null,
  // THE rule Esdras asked to have tested. Confirmed NOT a breach/bust
  // condition (unlike floatingLossRule below) - purely a payout gate.
  consistencyRule: { type: 'max-share-of-payout-profit', maxSharePct: 15, enforced: false, blocksPayoutOnly: true },
  withdrawalCycleDays: 14,
  floatingLossRule: {
    thresholdPct: 1, // flat - no purchase-date split found for this program (unlike Instant Premium)
    basis: 'unrealized-pnl-on-open-positions-vs-balance',
    consequence: 'permanent-account-closure',
    note: 'Checked at ANY moment, not just at trade close or day boundary - the account can be closed while a position is still open and before its stop is ever touched.',
  },
  // Two more rules found, neither modeled anywhere in this codebase (out of
  // scope for the current analysis - documented for the record):
  minHoldingTimeRule: 'profit-from-trades-held-under-2min-voided-at-payout',
  inactivityRule: 'account-breached-after-30-consecutive-days-with-no-trade',
};
