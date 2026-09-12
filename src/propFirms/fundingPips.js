// fundingPips.js
// FundingPips' challenge programs. Originally sourced in
// data/backtest-input/prop-firm-1step-comparison.md (checked against
// fundingpips.com/help.fundingpips.com in early September 2026), then
// RE-VERIFIED (2026-09-12, at Esdras's explicit request "tu as les règles
// des prop firm pour vrai?") via web search - direct fetches of
// help.fundingpips.com were blocked (429/403 from this environment both
// times), so this is cross-checked third-party summaries, NOT a primary
// page fetch, same confidence level as before. 2-Step Standard and 1-Step
// Flex numbers below were independently corroborated by two separate
// searches (one of which surfaced FundingPips' own help-article TITLES -
// "1 Step Flex", "2 Step Standard" - confirming these are real, current
// product names, not stale ones) - unchanged from the original research.
// FundingPips also runs a "2 Step Pro" and "2 Step Flex" (6%/6% targets,
// tighter limits) NOT modeled here - ask if you want those added too.
// Which program the CURRENTLY-LIVE account is actually enrolled in is not
// re-derived here (the branch name `challenge/fundingpips-zero` and the
// "Zero" profile below both point at FundingPips as the real broker, but
// not definitively at which of its programs) - confirm against the real
// account before assuming one over another. Note the combined-strategies
// simulations elsewhere in this project NAMED after FTMO
// (runFtmo1StepAccountImpact.js) in fact model FTMO 1-Step's own numbers
// (target +10%, trailing 10%, see ftmo.js's FTMO_1STEP) - the script's name
// is not a program identifier.
//
// Shape: see propFirms/index.js's PROP_FIRM_PROGRAM_SHAPE comment for what
// every field means and how it's used (guardrails/target tracking).

export const FUNDINGPIPS_2STEP_STANDARD = {
  id: 'fundingpips-2step-standard',
  firm: 'FundingPips',
  label: 'FundingPips 2-Step Standard',
  phases: [
    { name: 'Phase 1', targetPct: 8, dailyLossLimitPct: 5, maxDrawdownPct: 10, maxDrawdownType: 'static', minTradingDays: 3 },
    // Target is +5% of the balance AT THE START OF PHASE 2 (whatever Phase 1
    // finished with), not the original starting balance.
    { name: 'Phase 2', targetPct: 5, dailyLossLimitPct: 5, maxDrawdownPct: 10, maxDrawdownType: 'static', minTradingDays: 3 },
  ],
  profitSplit: null, // not verified in the source
  timeLimitDays: null, // confirmed no limit
  consistencyRule: null,
};

export const FUNDINGPIPS_1STEP_FLEX = {
  id: 'fundingpips-1step-flex',
  firm: 'FundingPips',
  label: 'FundingPips 1-Step Flex',
  phases: [
    { name: 'Flex', targetPct: 12, dailyLossLimitPct: 3, maxDrawdownPct: 12, maxDrawdownType: 'static', minTradingDays: null },
  ],
  profitSplit: null, // not verified in the source
  timeLimitDays: null, // confirmed no limit
  consistencyRule: null,
};

// FundingPips "Zero" - instant-funded, no challenge phase at all. Sourced
// from scripts/runFundingPipsZeroAccountImpact.js's own header comment,
// itself flagged there with a STRONGER caveat than the 1-Step/2-Step
// programs above: this project's direct access to fundingpips.com/
// help.fundingpips.com was blocked when it was researched, so these numbers
// come from two independent WebSearch summaries that agreed with each other,
// NOT a primary-source page fetch - re-verify before trusting this one even
// more than the others in this file. Re-checked 2026-09-12 (same "tu as les
// règles pour vrai?" request) via a fresh independent search - daily
// loss/drawdown numbers held up unchanged, and it additionally surfaced two
// rules not previously captured here: weekend positions are prohibited
// (must close everything before Friday's market close) and a 15%
// consistency rule applies to every payout - both documented below, neither
// enforced by the bot (see index.js's own note on what's actually enforced).
export const FUNDINGPIPS_ZERO = {
  id: 'fundingpips-zero',
  firm: 'FundingPips',
  label: 'FundingPips Zero',
  phases: [
    {
      name: 'Funded (instant)',
      targetPct: null, // no profit target - instant-funded, no challenge to pass
      dailyLossLimitPct: 3,
      maxDrawdownPct: 5,
      // Trailing off the equity high-water-mark, but per the search summary
      // it "locks" once trailing 5% below peak would otherwise exceed the
      // STARTING balance - i.e. floor = min(peak * 0.95, startingBalance).
      // This SPECIFIC interpretation is UNVERIFIED, same caveat as above.
      maxDrawdownType: 'trailing-locks-at-start-balance',
      minTradingDays: null,
    },
  ],
  // The one rule genuinely NEW to this program vs the others in this file:
  // total risk committed across ALL simultaneously open positions is capped
  // at 1% of current balance - not yet enforced anywhere in this codebase
  // (see runFundingPipsZeroAccountImpact.js, which only CHECKS it against
  // historical backtest data, doesn't gate live orders on it).
  maxOpenRiskPct: 1,
  profitSplit: null,
  timeLimitDays: null,
  // 15% of payout profit, per the 2026-09-12 re-check - documented, not enforced.
  consistencyRule: { type: 'max-share-of-payout-profit', maxSharePct: 15, enforced: false },
  // Documented, not enforced (no live position-close-before-weekend logic
  // exists anywhere in this codebase today).
  weekendRule: 'no-positions-held-over-the-weekend-close-before-friday-market-close',
};
