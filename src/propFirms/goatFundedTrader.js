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
