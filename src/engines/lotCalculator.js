// lotCalculator.js
// Position-size calculator: risk % of balance -> lot size, given an entry,
// a stop-loss, and the instrument's contract spec (value per point/pip per
// 1.0 lot). Mirrors what the Match-Trader mobile calculator did, but pulls
// specs from the broker's live Symbol data once connected (see cTraderClient.js)
// instead of a fixed table.
//
// !!! IMPORTANT !!!
// DEFAULT_SYMBOL_SPECS below are INDICATIVE placeholders for offline testing
// only. Real position sizing MUST use specs confirmed from FundingPips'
// published contract specifications or the live cTrader Symbols endpoint -
// a wrong point/pip value silently produces a wrong lot size and therefore
// the wrong dollar risk on a real account.
//
// PARTIALLY ADDRESSED 2026-09-16: cTraderDataSource.js now fetches each
// traded symbol's real ProtoOASymbol at boot and runs it through
// buildSpecFromBrokerSymbol() below, so the VOLUME side (lotSize and the
// min/step/max bounds) is broker-confirmed for any symbol the broker
// answers for - that is where the dangerous bug actually was, see that
// function's comment. The CASH side (pointSize, valuePerPointPerLot) is
// still carried over from the placeholders here. Those check out against
// the confirmed lot sizes for US100/US500/XAUUSD/EURUSD, but GER40 remains
// genuinely approximate: its lot is 1 index unit like US100, so its
// valuePerPointPerLot of 1 is really 1 EUR, not 1 USD, on a USD account -
// about 15% understated at current rates. Specs therefore still report
// verified:false; only `volumeVerified` is claimed.

export const DEFAULT_SYMBOL_SPECS = {
  US100: {
    kind: 'index',
    pointSize: 1,
    valuePerPointPerLot: 1, // $ per point per 1.0 lot - VERIFY against broker specs
    minVolume: 0.1,
    volumeStep: 0.1,
    maxVolume: 50,
    verified: false,
  },
  US500: {
    kind: 'index',
    pointSize: 1,
    valuePerPointPerLot: 1, // VERIFY against broker specs
    minVolume: 0.1,
    volumeStep: 0.1,
    maxVolume: 50,
    verified: false,
  },
  EURUSD: {
    kind: 'forex',
    pointSize: 0.0001,
    valuePerPointPerLot: 10, // standard lot = 100k units, ~$10/pip on a USD account
    minVolume: 0.01,
    volumeStep: 0.01,
    maxVolume: 100,
    verified: false,
  },
  GBPUSD: {
    kind: 'forex',
    pointSize: 0.0001,
    valuePerPointPerLot: 10,
    minVolume: 0.01,
    volumeStep: 0.01,
    maxVolume: 100,
    verified: false,
  },
  USDJPY: {
    kind: 'forex',
    pointSize: 0.01,
    valuePerPointPerLot: 9.2, // approximate - true value moves with the USDJPY rate
    minVolume: 0.01,
    volumeStep: 0.01,
    maxVolume: 100,
    verified: false,
  },
  XAUUSD: {
    kind: 'metal',
    pointSize: 0.01,
    valuePerPointPerLot: 1, // $1 per 0.01 move per 1.0 lot (100oz) - VERIFY against broker specs, indicative only
    minVolume: 0.01,
    volumeStep: 0.01,
    maxVolume: 50,
    verified: false,
  },
  // GER40 (2026-09-15, Weekly Liquidity Sweep - see config.js's
  // `weeklySweep` comment): same shape/convention as US100/US500 above
  // (index CFD, $1/point/lot placeholder) - never confirmed against
  // FundingPips' real GER40 contract spec, same caveat as every other entry
  // in this table. Esdras's real cTrader screenshot confirmed the SPREAD
  // (0.5 point, see transactionCosts.js) but not this risk-sizing value.
  GER40: {
    kind: 'index',
    pointSize: 1,
    valuePerPointPerLot: 1, // VERIFY against broker specs
    minVolume: 0.1,
    volumeStep: 0.1,
    maxVolume: 50,
    verified: false,
  },
  // BTCUSD's spec was removed 2026-09-16 with the symbol itself (see
  // config.js's `symbols` comment). Its measured contract numbers are kept
  // on record here, because they were derived from real fills rather than
  // guessed and would otherwise have to be re-measured if crypto is ever
  // revisited: two real closes (positionIds 41604229 and 41603614) agreed
  // exactly that 1 raw broker volume unit moves $0.01 per $1 of BTCUSD
  // price - i.e. 1 raw unit = 0.01 BTC of exposure, matching both the
  // ProtoOASymbolByIdReq-confirmed minVolume of 1 and the `units: 0.01`
  // shown for a real open position. That gives pointSize 1,
  // valuePerPointPerLot 0.01, min/step 1, with `rawVolume: true` so
  // _submitOrder() sends the unit count straight through instead of
  // applying its lotSize*100 convention.
  //
  // The `rawVolume` branch in _submitOrder() is deliberately LEFT IN PLACE:
  // it is inert for every symbol whose spec omits the flag, and removing it
  // would only re-open the question of how to send a raw broker volume the
  // next time a symbol needs one.
};

function decimalsOf(step) {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * @param {object} params
 * @param {number} params.balance - account balance/equity
 * @param {number} params.riskPct - risk percentage per trade, e.g. 0.5 for 0.5%
 * @param {number} params.entryPrice
 * @param {number} params.stopPrice
 * @param {object} params.symbolSpec - { pointSize, valuePerPointPerLot, minVolume, volumeStep, maxVolume }
 */
export function calculateLotSize({ balance, riskPct, entryPrice, stopPrice, symbolSpec }) {
  if (!(balance > 0)) throw new Error('balance must be a positive number');
  if (!(riskPct > 0)) throw new Error('riskPct must be a positive number');
  if (typeof entryPrice !== 'number' || typeof stopPrice !== 'number') {
    throw new Error('entryPrice and stopPrice must be numbers');
  }
  if (!symbolSpec) throw new Error('symbolSpec is required');
  const { pointSize, valuePerPointPerLot, minVolume, volumeStep, maxVolume } = symbolSpec;
  if (!(pointSize > 0) || !(valuePerPointPerLot > 0) || !(volumeStep > 0)) {
    throw new Error('symbolSpec must have positive pointSize, valuePerPointPerLot and volumeStep');
  }

  const distance = Math.abs(entryPrice - stopPrice);
  if (distance <= 0) throw new Error('entryPrice and stopPrice cannot be equal');

  const riskAmount = balance * (riskPct / 100);
  // round away float noise (e.g. 1.1 - 1.095 in JS floats) before it compounds
  const distanceInPoints = Math.round((distance / pointSize) * 1e8) / 1e8;
  const rawLots = riskAmount / (distanceInPoints * valuePerPointPerLot);

  const decimals = decimalsOf(volumeStep);
  let lots = Math.floor(rawLots / volumeStep) * volumeStep;
  lots = Number(lots.toFixed(decimals));

  const cappedByMin = lots < minVolume;
  const cappedByMax = lots > maxVolume;
  if (cappedByMin) lots = minVolume;
  if (cappedByMax) lots = maxVolume;

  const actualRiskAmount = lots * distanceInPoints * valuePerPointPerLot;

  return {
    lots,
    rawLots,
    riskAmount,
    actualRiskAmount,
    distance,
    distanceInPoints,
    cappedByMin,
    cappedByMax,
    specVerified: Boolean(symbolSpec.verified),
  };
}

export function getDefaultSpec(symbol) {
  return DEFAULT_SYMBOL_SPECS[symbol] || null;
}

/**
 * Turns the broker's OWN ProtoOASymbol contract spec into the shape
 * calculateLotSize()/_submitOrder() expect, replacing the placeholder
 * volume numbers above with confirmed ones.
 *
 * THE cTrader VOLUME MODEL, confirmed 2026-09-16 against this broker's real
 * ProtoOASymbolByIdReq responses for all five traded symbols:
 *   lotSize    - the broker `volume` value representing exactly 1.0 lot.
 *   min/step/maxVolume - also in those same raw volume units, NOT in lots.
 * So lots -> broker volume is simply `lots * lotSize`, and a volume bound
 * expressed in lots is `volume / lotSize`.
 *
 * The real values, and the cross-check that pins the model down:
 *   US100  lotSize 100       min 1        -> 0.01 lots
 *   US500  lotSize 100       min 1        -> 0.01 lots
 *   GER40  lotSize 100       min 1        -> 0.01 lots
 *   XAUUSD lotSize 10000     min 100      -> 0.01 lots
 *   EURUSD lotSize 10000000  min 100000   -> 0.01 lots
 * Five independent symbols all landing on exactly cTrader's standard 0.01
 * minimum lot is what confirms min/step/max are in volume units and that
 * lotSize is the per-lot scale - not a coincidence any other reading
 * produces.
 *
 * WHAT THIS FIXES: _submitOrder used `lots * lotSize * 100` with lotSize
 * defaulting to a hardcoded 100000, because no spec above ever defined one.
 * cTrader's lotSize ALREADY carries that factor of 100 (EURUSD's 10000000
 * is 100000 units x 100), so the formula multiplied by 100 a second time on
 * top of a forex-shaped guess. It was right for EURUSD purely by accident
 * (100000 * 100 == its real lotSize) and catastrophically wrong everywhere
 * else: 100000x too large on US100/US500/GER40, 1000x on XAUUSD. Those
 * orders exceed the symbols' own maxVolume (20000 and 200000), so in
 * practice every auto-executed order on four of the five live symbols would
 * have been rejected outright by the broker. It was never caught because
 * the only symbol that ever really traded was BTCUSD, which set
 * `rawVolume: true` to bypass this formula entirely.
 *
 * pointSize/valuePerPointPerLot are deliberately kept from the placeholder
 * spec rather than derived from digits/pipPosition: the broker's spec does
 * not state a per-point cash value directly, and the existing pairs check
 * out against the confirmed lot sizes (XAUUSD 1 lot = 100oz, so $0.01/oz =
 * $1/point; EURUSD 1 lot = 100k, so 1 pip = $10; US100/US500 1 lot = 1
 * index unit, so 1 point = $1). Deriving them would mean guessing where
 * measuring already agrees.
 *
 * @param {object} brokerSymbol - one ProtoOASymbol from ProtoOASymbolByIdReq
 * @param {object} placeholder - the matching DEFAULT_SYMBOL_SPECS entry
 * @returns {object|null} a spec with broker-confirmed volume fields, or null
 *   if the response lacks a usable lotSize (caller keeps the placeholder)
 */
export function buildSpecFromBrokerSymbol(brokerSymbol, placeholder) {
  if (!brokerSymbol || !placeholder) return null;
  // Every one of these is an int64 -> a STRING on this broker. Number()
  // them explicitly rather than relying on implicit coercion.
  const lotSize = Number(brokerSymbol.lotSize);
  if (!Number.isFinite(lotSize) || lotSize <= 0) return null;

  const inLots = (raw, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n / lotSize : fallback;
  };

  // Price precision, straight from the broker (ProtoOASymbol.digits is a
  // REQUIRED field). _submitOrder needs it to round relativeStopLoss /
  // relativeTakeProfit onto the symbol's own price grid - see
  // toRelativeProtectionDistance(). Left undefined when absent so the
  // caller can tell "unknown" from a real 0.
  const digits = Number(brokerSymbol.digits);

  return {
    ...placeholder,
    ...(Number.isInteger(digits) && digits >= 0 ? { digits } : {}),
    lotSize, // raw broker volume for 1.0 lot - consumed by _submitOrder
    minVolume: inLots(brokerSymbol.minVolume, placeholder.minVolume),
    volumeStep: inLots(brokerSymbol.stepVolume, placeholder.volumeStep),
    maxVolume: inLots(brokerSymbol.maxVolume, placeholder.maxVolume),
    // Only the volume side is broker-confirmed. pointSize and
    // valuePerPointPerLot still come from the placeholder, so this is not
    // a fully verified spec and must not claim to be one.
    verified: false,
    volumeVerified: true,
    // Real overnight financing (2026-09-22, Esdras: "mesure le swap" - see HANDOFF.md's RSI(2)/US500 daily candidate, whose backtest assumed an
    // unmeasured 0.01 %/day). ProtoOASymbol carries the broker's ACTUAL swap rate per side - no need to hold a position overnight to observe it.
    // swapLong/swapShort: PIPS = points per lot per day (same unit as pointSize below); PERCENTAGE = annual %, applied to notional. Both sides kept
    // (a short RSI(2) variant or another symbol could need swapShort) - undefined (not 0) when the broker didn't send a usable value, so a missing
    // spec never silently reads as "no swap cost" the way a 0 default would.
    swapLong: Number.isFinite(Number(brokerSymbol.swapLong)) ? Number(brokerSymbol.swapLong) : undefined,
    swapShort: Number.isFinite(Number(brokerSymbol.swapShort)) ? Number(brokerSymbol.swapShort) : undefined,
    swapCalculationType: brokerSymbol.swapCalculationType === 1 ? 'PERCENTAGE' : brokerSymbol.swapCalculationType === 0 ? 'PIPS' : undefined,
    swapPeriodHours: Number.isFinite(Number(brokerSymbol.swapPeriod)) ? Number(brokerSymbol.swapPeriod) : undefined,
    swapRollover3Days: brokerSymbol.swapRollover3Days ?? undefined, // e.g. 'WEDNESDAY' - that day charges 3x (weekend rollover), not a bigger daily rate
  };
}

/**
 * Converts a broker swap rate (from buildSpecFromBrokerSymbol's swapLong/swapShort) into a fraction of NOTIONAL per calendar day - the same unit
 * `SWAP` uses in scripts/runPreregBatch3.js's daily backtest. Returns null when the spec has no usable swap (never 0, for the same "don't silently
 * claim zero cost" reason as the fields above).
 * PERCENTAGE: swapLong/swapShort is already an annual percentage -> /100/365.
 * PIPS: swapLong/swapShort is points per LOT per day; converted to a fraction of notional via pointSize and lotSize*price (one lot's notional).
 */
export function swapFractionPerDay(spec, side, price) {
  if (!spec) return null;
  const rate = side === 'short' ? spec.swapShort : spec.swapLong;
  if (!Number.isFinite(rate)) return null;
  if (spec.swapCalculationType === 'PERCENTAGE') return rate / 100 / 365;
  if (spec.swapCalculationType === 'PIPS') {
    if (!Number.isFinite(spec.pointSize) || !Number.isFinite(spec.lotSize) || !(price > 0)) return null;
    const notionalPerLot = spec.lotSize * price;
    return notionalPerLot > 0 ? (rate * spec.pointSize) / notionalPerLot : null;
  }
  return null;
}
