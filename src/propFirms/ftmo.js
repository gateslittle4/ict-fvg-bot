// ftmo.js
// FTMO's two challenge programs. Originally sourced in
// data/backtest-input/prop-firm-1step-comparison.md (checked against
// ftmo.com/help.ftmo.com in early September 2026), then RE-VERIFIED directly
// (2026-09-12, at Esdras's explicit request "tu as les règles des prop firm
// pour vrai? tu as accès à internet?") against FTMO's own
// https://ftmo.com/en/trading-objectives/ page (fetched live, not a
// secondary summary) - both phases/every number below CONFIRMED unchanged
// from the original research. profitSplit was NOT on that primary page;
// kept from cross-checking multiple independent third-party rule summaries
// that all agreed (90% / 80%) - lower confidence than the primary-confirmed
// fields above it, but not blocking/enforced by the bot either way. Re-
// verify before buying or relying on this for a real challenge - rules and
// prices change.
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

// The FUNDED "FTMO Account" that follows passing FTMO_1STEP above - a
// SEPARATE, real account with its own login FTMO issues once the
// evaluation is passed (Esdras, 2026-09-12: "2 comptes différents de FTMO
// peut être utilisé dans l'onglet FTMO, car il y a un compte challenge
// avec ses règles et le live avec ses propres règles?"). Verified directly
// against ftmo.com/en/trading-objectives/ (live fetch, 2026-09-12,
// specifically asked to compare Challenge vs. the post-Challenge FTMO
// Account): for the 1-Step program, the funded account's loss rules are
// IDENTICAL to the Challenge's (3% daily, 10% end-of-day trailing) - the
// ONLY change is the profit target disappearing ("There is no Profit
// Target on the subsequent FTMO Account (1-Step)"). Modeled as its own
// program (targetPct: null) rather than reusing FTMO_1STEP's phase
// directly, so the dashboard/alert logic never expects a target that no
// longer exists once an account has actually been funded.
//
// One more detail from that same page, worth keeping: the 10% floor
// "resets when rewards withdrawn and new account provided" - i.e. a
// withdrawal does NOT leave the floor chasing the pre-withdrawal high
// forever. This corroborates (doesn't fully confirm the exact mechanic,
// but supports) the assumption already used in
// scripts/runFtmo25kCumulativeWithdrawalByDateAnalysis.js (a withdrawal
// locks in the trailing floor at the new, lower balance).
export const FTMO_1STEP_FUNDED = {
  id: 'ftmo-1step-funded',
  firm: 'FTMO',
  label: 'FTMO 1-Step — Compte financé',
  phases: [
    {
      name: 'Financé',
      targetPct: null, // no profit target once funded - confirmed on the primary page
      dailyLossLimitPct: 3,
      maxDrawdownPct: 10,
      maxDrawdownType: 'trailing-eod', // same mechanism as the Challenge - "identical loss parameters"
      minTradingDays: null,
    },
  ],
  profitSplit: 0.9,
  timeLimitDays: null,
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
  // 2026-09-12: not on FTMO's own trading-objectives page (primary source),
  // but multiple independent third-party rule summaries agree on 80% -
  // lower confidence than the primary-confirmed fields above, not enforced
  // by the bot either way.
  profitSplit: 0.8,
  timeLimitDays: null, // not precised either way in the source - treat as UNKNOWN, not "no limit"
  consistencyRule: null, // none found
};
