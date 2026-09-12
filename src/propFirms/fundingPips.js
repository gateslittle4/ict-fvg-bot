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

// RE-CHECKED 2026-09-12 (Esdras: "teste FundingPips 1-Step Flex", after
// asking why FTMO kept coming out ahead). Direct fetches of both
// fundingpips.com/payouts and the help.fundingpips.com article were
// blocked again (429 then 403) - same access problem noted the first time
// this file was researched. Everything below comes from search-engine
// snippets of FundingPips' own pages and cross-referencing third-party
// summaries, NOT a primary page render - re-verify before buying.
export const FUNDINGPIPS_1STEP_FLEX = {
  id: 'fundingpips-1step-flex',
  firm: 'FundingPips',
  label: 'FundingPips 1-Step Flex',
  phases: [
    { name: 'Flex', targetPct: 12, dailyLossLimitPct: 3, maxDrawdownPct: 12, maxDrawdownType: 'static', minTradingDays: null },
  ],
  // NOW confirmed (was null/unverified before): "one flat 85% bi-weekly
  // split with no payout menu" - multiple independent sources agree.
  profitSplit: 0.85,
  timeLimitDays: null, // confirmed no limit
  consistencyRule: null, // none found for THIS program specifically (Zero/2-Step have one, Flex doesn't)
  // First payout: profit must reach >= 1% of account size, requestable
  // every 2 weeks (bi-weekly "Tuesday Payday" cycle) - a % floor, not a
  // fixed dollar amount like FTMO's implicit $-in-profit requirement.
  payoutCycleDays: 14,
  firstPayoutMinProfitPct: 1,
  payoutProcessingDays: 3, // "processed every Tuesday, typically completes within 1-3 business days"
  // ⚠️ GENUINE AMBIGUITY, not resolved - flagged rather than silently
  // picking one number. Two different descriptions of what looks like the
  // same underlying mechanism (a floating-loss cap on a single "trade
  // idea" - one instrument+direction, or any re-entry within 10min of
  // closing a loser counts as the same idea) turned up DIFFERENT numbers:
  //   (a) A "Striking System" specific to 1-Step Flex: a WARNING at 1% of
  //       account size: 4 cumulative warnings (never reset) breach the
  //       account, the 2nd warning HALVES the profit split.
  //   (b) A separate "Risk Per Trade Idea" article: 3% (<$50k accounts) or
  //       2% (>=$50k) combined realized+unrealized loss on one trade idea
  //       is an IMMEDIATE hard breach - no warnings.
  // Could be the same rule described at different dates (FundingPips may
  // have changed it), or two different concurrent mechanisms. NOT enforced
  // by the bot either way. Modeled in
  // scripts/runFundingPips1StepFlexFirstPayoutByDateAnalysis.js using the
  // STRICTER reading (b) as the conservative default, with (a) noted for
  // comparison - re-verify directly before trusting either number with
  // real capital.
  tradeIdeaFloatingLossRule: {
    strictThresholdPct: 3, // (b) - <$50k accounts, immediate hard breach - used as the conservative default
    strictThresholdPctLarge: 2, // (b) - >=$50k accounts
    lenientThresholdPct: 1, // (a) - "Striking System": warning, not immediate breach
    lenientStrikesToClose: 4,
    lenientSplitHalvedAtStrike: 2,
    basis: 'same-instrument-same-direction-or-reentry-within-10min-of-a-loss',
    consequenceStrict: 'immediate-account-closure',
    consequenceLenient: 'warning-then-closure-at-4th-cumulative-warning',
  },
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
