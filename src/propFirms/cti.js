// cti.js
// City Traders Imperium (CTI) 1-Step Challenge. Sourced live (2026-09-12,
// as part of researching a cheaper FTMO alternative) from
// citytradersimperium.com/1-step-challenge-trailing-drawdown/ and
// citytradersimperium.com/funded-account-challenge-funding-program/ - the
// same research that produced scripts/runCti1StepAllLiveStrategiesCycle
// AccountImpact.js (which hardcoded these same numbers directly for its
// standalone simulation, before this file existed as the real registry
// entry). Re-verify before buying or relying on this for a real challenge -
// rules and prices change.
//
// Shape: see propFirms/index.js's PROP_FIRM_PROGRAM_SHAPE comment for what
// every field means and how it's used (guardrails/target tracking).
//
// NOT included here: CTI's Free Trial (the $100k, 14-day, no-target demo
// Esdras is actually using first - see HANDOFF.md 2026-09-13). The trial
// has no pass/fail consequence and no confirmed drawdown/target numbers of
// its own ("no targets, no pressure, just a genuine test" per CTI's own
// trial page) - inventing guardrail numbers for it would be worse than
// leaving propFirmProgramId unset on that account (generic guardrails
// apply instead, informational only, matching the trial's own no-stakes
// nature). Assign this program (cti-1step) once a REAL paid challenge is
// bought.
export const CTI_1STEP = {
  id: 'cti-1step',
  firm: 'CTI',
  label: 'City Traders Imperium 1-Step',
  phases: [
    {
      name: '1-Step',
      targetPct: 8,
      dailyLossLimitPct: null, // confirmed "no daily loss limit" on the 1-Step
      maxDrawdownPct: 5,
      // Balance-based trailing drawdown - the floor follows the highest
      // BALANCE ever reached, updated the INSTANT a trade closes - never
      // equity/unrealized, but also NOT the same as FTMO's 'trailing-eod'
      // (which only ratchets the floor at day BOUNDARIES - see
      // GuardrailEngine's own doc comment, confirmed by reading its code
      // 2026-09-13: peakEodBalance only updates once per day). On a day
      // with multiple trades, EOD-only would miss an intraday peak that a
      // later loss pulled back from BEFORE the day boundary - CTI's real
      // floor can be stricter than 'trailing-eod' would compute, so
      // reusing that type here would UNDER-protect, not just be
      // approximate. None of GuardrailEngine's 3 existing types are
      // correct for this - same situation as GoatFundedTrader's
      // real-time-equity trailing (see that file's own comment) - so this
      // uses its own distinct, UNRECOGNIZED type name on purpose: an
      // unrecognized type fails OPEN in GuardrailEngine (never blocks live
      // trading on a wrong guess), so this is measured only by
      // scripts/runCti1StepAllLiveStrategiesCycleAccountImpact.js today,
      // not enforced live, until GuardrailEngine actually implements
      // "trailing on every close" as its own mechanic.
      maxDrawdownType: 'trailing-on-every-close',
      // Ambiguous between sources: the funding-program comparison page says
      // "none", the dedicated 1-Step page + a third-party aggregator say
      // "3 profitable days (>=0.5% net each)" - not modeled either way
      // (minTradingDays tracking isn't enforced anywhere in this codebase
      // yet, same caveat as every other program in this file).
      minTradingDays: null,
    },
  ],
  profitSplit: 0.8, // starts at 80%, scales to 90%/100% via VIP tiers not detailed in the source
  timeLimitDays: null, // confirmed "no time limit"
  consistencyRule: null, // none found
  // The funded account keeps EXACTLY the same 5% trailing floor as the
  // challenge (verified live, 2026-09-13, at Esdras's "ça c'est pour le
  // challenge mais on peut modifier au live?") - only the (already-absent)
  // daily loss limit and the target disappear. No separate FUNDED program
  // object needed here the way FTMO_1STEP_FUNDED exists (targetPct: null
  // would be the only difference, and nothing in this codebase reads
  // targetPct as a blocking condition once null - see GuardrailEngine).
};
