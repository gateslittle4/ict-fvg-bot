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
