// haitiforex.js
// HaitiForex's $100,000 challenge tier - the one Esdras asked about
// ("leur challenge est le plus difficile", 2026-09-19). Rules read directly
// off haitiforex.org (Open-Account.html/Practice.html, HTTPS broken on this
// site - fetched over plain HTTP). The site lists 4 account tiers with
// daily gain caps from $1,100 to $5,500; only the $100k tier ($2,200/day
// cap, matching the figure Esdras already had before this was confirmed)
// was extracted with the same rigor as the other firms in this directory -
// re-verify directly with HaitiForex before adding another tier here.
//
// Shape: see propFirms/index.js's PROP_FIRM_PROGRAM_SHAPE comment for the
// standard fields. HaitiForex's rules don't map cleanly onto that shape in
// two ways worth flagging up front:
//   - There is NO daily loss limit at all ("AUCUNE LIMITE DE PERTE
//     QUOTIDIENNE" per the site) - dailyLossLimitPct is null, not a typo.
//   - maxDrawdownType is 'static' (5% of the ORIGINAL $100k balance, not a
//     trailing peak) - confirmed by scripts/runHaitiForexChallengeSimulation.js's
//     own BUST_PCT check (`balance <= STARTING_BALANCE * (1 - BUST_PCT/100)`).
//
// HaitiForex ALSO has three rules with no equivalent field anywhere in the
// standard shape - a daily GAIN cap (the opposite of every other firm here,
// which cap losses, not gains), a hard account-age deadline (not just a
// trading-day minimum), and a same-day forced-close time. Documented here
// as extra, firm-specific fields rather than stretched to fit an existing
// one - exactly the "documented for the record, not silently assumed safe"
// discipline index.js's own header already applies to minTradingDays/
// profitSplit/consistencyRule for every other firm.
//
// WHAT THE BOT ACTUALLY ENFORCES TODAY: NOTHING below is wired into
// GuardrailEngine/LiveStrategyEngine yet - same "measure before wiring"
// discipline already applied to CTI/GoatFundedTrader (see index.js). The
// daily gain cap and forced 16:00 NY close are currently modeled ONLY in
// the standalone analysis script above, not enforced on a real account.
// Before running a real HaitiForex account through this bot, at minimum:
//   1. dailyGainCapUsd needs a real GuardrailEngine check (today's realized
//      gain vs. the cap, vetoing/deferring further profitable exits once
//      hit - the exact mechanic HaitiForex uses if the cap is EXCEEDED
//      mid-trade, rather than checked before entry, is NOT confirmed).
//   2. forcedCloseNyHour needs a scheduled flatten-and-block mechanism (no
//      new entries after some safety margin, force-close anything still
//      open) - nothing like this exists in AccountRuntime today.
//   3. maxAccountDurationDays needs an account-age check entirely separate
//      from minTradingDays (a calendar deadline, not a trading-day count).
export const HAITIFOREX_100K = {
  id: 'haitiforex-100k',
  firm: 'HaitiForex',
  label: 'HaitiForex $100k',
  phases: [
    {
      name: 'Challenge',
      targetPct: 10,
      dailyLossLimitPct: null, // confirmed: no daily loss limit on this firm
      maxDrawdownPct: 5,
      maxDrawdownType: 'static', // off the original $100k balance, never trails a peak
      minTradingDays: 5,
    },
  ],
  profitSplit: null, // not found on the pages checked
  timeLimitDays: null, // no per-phase time limit found; see maxAccountDurationDays below instead
  consistencyRule: null, // none found

  // HaitiForex-specific fields, not part of the standard shape (see header) -
  // NONE of these are enforced by the bot yet.
  dailyGainCapUsd: 2200,
  maxAccountDurationDays: 30, // calendar days from account start, not a trading-day count
  forcedCloseNyHour: 16, // every position must be flat by this NY hour or the account is cancelled
  minTradeDurationMinutes: 5, // "no scalping"
  mandatoryStopLoss: true, // a trade without one has its gain cancelled per the site's own rules
  hedgingAllowed: false,

  // Red flags noted 2026-09-19, unrelated to the strategy/rules above -
  // verify directly with HaitiForex before any real payment: payout via
  // personal payment apps (MonCash/Zelle/CashApp/Wise, not a regulated
  // payment processor), unverifiable testimonials, and the same site also
  // solicits $3,000 "investors" against a $250,000 escrow (MLM-shaped, not
  // typical of a prop-firm challenge page).
};
