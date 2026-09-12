// ftmo.js
// FTMO's two challenge programs, as sourced in
// data/backtest-input/prop-firm-1step-comparison.md (checked against
// ftmo.com/help.ftmo.com in early September 2026 - re-verify before buying
// or relying on this for a real challenge, rules and prices change).
//
// Shape: see propFirms/index.js's PROP_FIRM_PROGRAM_SHAPE comment for what
// every field means and how it's used (guardrails/target tracking).

export const FTMO_1STEP = {
  id: 'ftmo-1step',
  firm: 'FTMO',
  label: 'FTMO 1-Step',
  phases: [
    {
      name: 'Challenge',
      targetPct: 10,
      dailyLossLimitPct: 3,
      maxDrawdownPct: 10,
      // "Trailing fin de journée" - the floor follows the highest END-OF-DAY
      // closing balance ever reached, not real-time equity and not a fixed
      // starting-balance floor. See maxDrawdownType doc in index.js.
      maxDrawdownType: 'trailing-eod',
      minTradingDays: null, // none found in the source
    },
  ],
  profitSplit: 0.9,
  timeLimitDays: null, // confirmed "no time limits"
  // "Best Day 50%": the single best day can't exceed 50% of total positive-day
  // profit - soft/correctable, not an instant violation per the source. Not
  // enforced by the bot (see index.js's own note) - documented for the
  // record only.
  consistencyRule: { type: 'best-day-max-share-of-profit', maxSharePct: 50, enforced: false },
};

export const FTMO_2STEP = {
  id: 'ftmo-2step',
  firm: 'FTMO',
  label: 'FTMO 2-Step',
  phases: [
    { name: 'Challenge', targetPct: 10, dailyLossLimitPct: 5, maxDrawdownPct: 10, maxDrawdownType: 'static', minTradingDays: 4 },
    // Every phase's targetPct is a % of the balance AT THE START OF THAT
    // PHASE (i.e. whatever balance Challenge finished with, not the original
    // starting balance) - see index.js's phase-tracking note.
    { name: 'Verification', targetPct: 5, dailyLossLimitPct: 5, maxDrawdownPct: 10, maxDrawdownType: 'static', minTradingDays: 4 },
  ],
  profitSplit: null, // not found in the source
  timeLimitDays: null, // not precised either way in the source - treat as UNKNOWN, not "no limit"
  consistencyRule: null, // none found
};
