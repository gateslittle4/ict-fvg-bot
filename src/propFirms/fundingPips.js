// fundingPips.js
// FundingPips' two challenge programs, as sourced in
// data/backtest-input/prop-firm-1step-comparison.md (checked against
// fundingpips.com/help.fundingpips.com in early September 2026 - re-verify
// before buying or relying on this for a real challenge, rules and prices
// change). "2-Step Standard" is referenced as "déjà validé" in
// scripts/runFundingPipsZeroAccountImpact.js's own header - which program
// the CURRENTLY-LIVE account is actually enrolled in is not re-derived here
// (the branch name `challenge/fundingpips-zero` and the "Zero" profile below
// both point at FundingPips as the real broker, but not definitively at
// which of its 3 programs) - confirm against the real account before
// assuming one over another. Note the combined-strategies simulations
// elsewhere in this project NAMED after FTMO (runFtmo1StepAccountImpact.js)
// in fact model FTMO 1-Step's own numbers (target +10%, trailing 10%, see
// ftmo.js's FTMO_1STEP) - the script's name is not a program identifier.
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
// more than the others in this file.
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
  consistencyRule: null,
};
