// propFirms/index.js
// Registry of every prop-firm CHALLENGE PROGRAM this project knows the real
// rules for (2026-09, at Esdras's explicit request: "je dois coder
// spécifiquement pour chaque prop firm... le robot devrait être spécifique
// pour chaque type de prop firme"). One file per firm (ftmo.js,
// fundingPips.js, goatFundedTrader.js, ...), each exporting one object per
// PROGRAM that firm offers (a firm can have several - e.g. FTMO's 1-Step vs
// 2-Step are two entirely different rule sets) - this file just collects
// them all under one lookup by `id`.
//
// PROP_FIRM_PROGRAM_SHAPE (documentation only, not a runtime type):
//   id               - stable string, used everywhere else (accountRegistry.js,
//                       CONFIG.accounts[i].propFirmProgramId) to reference this
//                       program without importing the firm module directly.
//   firm, label      - display only.
//   phases           - ordered array, one entry per phase this program has
//                       (length 1 for a "1-Step"/instant program, 2+ for a
//                       "2-Step" one). Each phase:
//                         name              - display only.
//                         targetPct         - % profit target for this phase,
//                                             OF THE BALANCE AT THE START OF
//                                             THIS PHASE (not the original
//                                             starting balance for phase 2+).
//                                             null = no target (instant-funded).
//                         dailyLossLimitPct - this phase's own daily loss cap.
//                         maxDrawdownPct    - this phase's own max total loss cap.
//                         maxDrawdownType   - 'static' (off the ORIGINAL
//                                             starting balance, never moves),
//                                             'trailing-eod' (off the highest
//                                             END-OF-DAY closing balance ever
//                                             reached), or
//                                             'trailing-locks-at-start-balance'
//                                             (trailing off real-time peak
//                                             equity, but the floor stops
//                                             rising once it would exceed the
//                                             starting balance - see
//                                             fundingPips.js's Zero program).
//                         minTradingDays    - null if none required.
//   profitSplit      - 0-1 fraction, or null if not verified/found.
//   timeLimitDays    - null if confirmed no limit OR simply not found/verified
//                       (the two are NOT distinguished here - check the
//                       specific firm file's comment for which applies).
//   consistencyRule  - firm-specific soft rule (e.g. FTMO's "best day <=50%
//                       of total profit"), or null. NONE of these are
//                       enforced by the bot today - see the note below.
//
// WHAT THE BOT ACTUALLY ENFORCES TODAY (2026-09, Phase 2 of the multi-account
// rollout - see HANDOFF.md): only dailyLossLimitPct (already existed, via
// GuardrailEngine) and maxDrawdownPct/maxDrawdownType (NEW - see
// AccountRuntime's overall-drawdown tracking) are wired into real trade
// blocking. targetPct is used only to ALERT once reached (see
// AccountRuntime.checkChallengeTarget) - per Esdras's explicit instruction,
// reaching a phase's target does NOT auto-switch rules; she manually adds a
// new account entry (with the next phase's program/credentials) once the
// prop firm actually grants it. minTradingDays/profitSplit/timeLimitDays/
// consistencyRule/weekendRule/newsRule are DOCUMENTED for the record but not
// tracked or enforced anywhere yet - a future addition, not silently assumed
// safe.

import { FTMO_1STEP, FTMO_2STEP } from './ftmo.js';
import { FUNDINGPIPS_2STEP_STANDARD, FUNDINGPIPS_1STEP_FLEX, FUNDINGPIPS_ZERO } from './fundingPips.js';
import { GOATFUNDEDTRADER_1STEP, GOATFUNDEDTRADER_INSTANT_PREMIUM, GOATFUNDEDTRADER_INSTANT_HERO } from './goatFundedTrader.js';

// A 4th prop firm is coming (Esdras: "je te dirai le nom moi-même") - add its
// file the same way as the three above, then list its program(s) here. No
// placeholder entry is registered for it yet: an unverified made-up program
// would be worse than simply not having one.
export const PROP_FIRM_PROGRAMS = {
  [FTMO_1STEP.id]: FTMO_1STEP,
  [FTMO_2STEP.id]: FTMO_2STEP,
  [FUNDINGPIPS_2STEP_STANDARD.id]: FUNDINGPIPS_2STEP_STANDARD,
  [FUNDINGPIPS_1STEP_FLEX.id]: FUNDINGPIPS_1STEP_FLEX,
  [FUNDINGPIPS_ZERO.id]: FUNDINGPIPS_ZERO,
  [GOATFUNDEDTRADER_1STEP.id]: GOATFUNDEDTRADER_1STEP,
  [GOATFUNDEDTRADER_INSTANT_PREMIUM.id]: GOATFUNDEDTRADER_INSTANT_PREMIUM,
  [GOATFUNDEDTRADER_INSTANT_HERO.id]: GOATFUNDEDTRADER_INSTANT_HERO,
};

export function getPropFirmProgram(id) {
  return PROP_FIRM_PROGRAMS[id] || null;
}

export function listPropFirmPrograms() {
  return Object.values(PROP_FIRM_PROGRAMS);
}
