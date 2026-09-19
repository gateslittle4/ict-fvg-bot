// instrumentSpecs.js
// What the Simulateur needs to turn a price move into MONEY the way a broker does (2026-09-19, Esdras: "on veut
// construire un véritable simulateur"): the QUOTE currency of an instrument, its contract size (units per lot),
// and how to convert quote-currency P&L into the account currency (USD) with the conversion pair - taken from the
// project's own datasets at the time of each candle, never a fixed rate. If no conversion pair exists in the
// data, the answer is "unavailable" and the page says P&L is in the quote currency instead of guessing a rate.

const INDEX_QUOTE = { US100: 'USD', US500: 'USD', GER40: 'EUR', UKX: 'GBP', AUX: 'AUD' };
const FOREIGN_CONTRACT = 100000;

/** @returns {{quote:string, contractSize:number, kind:'forex'|'metal'|'index', lotLabel:string}} */
export function instrumentSpec(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (s === 'XAUUSD') return { quote: 'USD', contractSize: 100, kind: 'metal', lotLabel: '1 lot = 100 oz' };
  if (INDEX_QUOTE[s]) return { quote: INDEX_QUOTE[s], contractSize: 1, kind: 'index', lotLabel: '1 lot = 1 unité de l\'indice' };
  if (/^[A-Z]{6}$/.test(s)) return { quote: s.slice(3), contractSize: FOREIGN_CONTRACT, kind: 'forex', lotLabel: '1 lot = 100 000 unités' };
  return { quote: 'USD', contractSize: 1, kind: 'index', lotLabel: '1 lot = 1 unité (contrat inconnu : à régler)', unknown: true };
}

/**
 * How to express one unit of `quote` in USD, using only datasets that exist.
 * @param {string} quote
 * @param {string[]} available - symbols that have data
 * @returns {{status:'none'}|{status:'ok', combine:'single'|'ratio', legs:Array<{symbol:string, mode:'mul'|'div'}>}|{status:'unavailable'}}
 */
export function conversionPlan(quote, available) {
  if (quote === 'USD') return { status: 'none' };
  const has = (s) => available.includes(s);
  if (has(`${quote}USD`)) return { status: 'ok', combine: 'single', legs: [{ symbol: `${quote}USD`, mode: 'mul' }] };
  if (has(`USD${quote}`)) return { status: 'ok', combine: 'single', legs: [{ symbol: `USD${quote}`, mode: 'div' }] };
  // a cross against JPY (NZDJPY) and USDJPY give NZDUSD: (JPY per NZD) / (JPY per USD)
  if (has(`${quote}JPY`) && has('USDJPY')) return { status: 'ok', combine: 'ratio', legs: [{ symbol: `${quote}JPY`, mode: 'mul' }, { symbol: 'USDJPY', mode: 'mul' }] };
  return { status: 'unavailable' };
}

/**
 * Turns the plan's price series into [timeMs, rate] points (account currency per quote unit).
 * @param {'single'|'ratio'} combine
 * @param {Array<{mode:'mul'|'div', bars:Array<{time:number, close:number}>}>} legs
 */
export function buildRateSeries(combine, legs) {
  if (combine === 'single') {
    const [{ mode, bars }] = legs;
    return bars.filter((b) => b.close > 0).map((b) => [b.time, mode === 'div' ? 1 / b.close : b.close]);
  }
  // ratio: numerator leg / denominator leg on the union of times, each side carried forward
  const [num, den] = legs;
  const times = [...new Set([...num.bars.map((b) => b.time), ...den.bars.map((b) => b.time)])].sort((a, b) => a - b);
  const out = [];
  let i = 0, j = 0, cn = null, cd = null;
  for (const t of times) {
    while (i < num.bars.length && num.bars[i].time <= t) cn = num.bars[i++].close;
    while (j < den.bars.length && den.bars[j].time <= t) cd = den.bars[j++].close;
    if (cn > 0 && cd > 0) out.push([t, cn / cd]);
  }
  return out;
}
