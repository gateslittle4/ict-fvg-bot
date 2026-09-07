// fvgEngine.js
// ICT Fair Value Gap (FVG) detector with two-tier alerts:
//   1. "watching"  -> a new FVG has just formed (3-candle imbalance)
//   2. "validated" -> price has returned into a previously-formed FVG (entry trigger)
//
// A bullish FVG forms across 3 consecutive candles [c1, c2, c3] when:
//   c1.high < c3.low   (there is a price "gap" nobody traded in)
// The gap zone is [c1.high, c3.low]. Price later dipping back into that zone
// is the classic ICT re-entry trigger.
//
// A bearish FVG is the mirror image:
//   c1.low > c3.high   -> zone [c3.high, c1.low]
//
// This engine is timeframe-agnostic: feed it closed candles for whatever
// timeframe you're trading (the bot is configured for M15 by default).

const DEFAULT_MAX_AGE_CANDLES = 50; // drop an unmitigated FVG after this many candles (stale)

export class FvgEngine {
  /**
   * @param {object} opts
   * @param {string} opts.symbol - instrument name, e.g. "US100"
   * @param {number} [opts.maxAgeCandles] - candles after which an unfilled FVG is dropped as stale
   */
  constructor({ symbol, maxAgeCandles = DEFAULT_MAX_AGE_CANDLES } = {}) {
    if (!symbol) throw new Error('FvgEngine requires a symbol');
    this.symbol = symbol;
    this.maxAgeCandles = maxAgeCandles;
    this.history = []; // last 3 candles kept for detection
    this.active = [];  // active (unmitigated) FVGs: {direction, top, bottom, formedAt, candlesSinceFormed, id}
    this.candleIndex = 0;
    this._idCounter = 0;
  }

  /**
   * Feed one new CLOSED candle. Returns an array of events (may be empty).
   * candle: { time, open, high, low, close }
   */
  processCandle(candle) {
    const events = [];
    this.candleIndex += 1;

    // 1) Check existing active FVGs for mitigation ("entry validated") or staleness first,
    //    using the *incoming* candle's range against zones formed on prior candles.
    const stillActive = [];
    for (const fvg of this.active) {
      fvg.candlesSinceFormed += 1;

      const enteredZone =
        fvg.direction === 'bullish'
          ? candle.low <= fvg.top   // price dipped back down into the discount zone
          : candle.high >= fvg.bottom; // price rallied back up into the premium zone

      if (enteredZone) {
        events.push({
          type: 'validated',
          symbol: this.symbol,
          direction: fvg.direction,
          zone: { top: fvg.top, bottom: fvg.bottom },
          id: fvg.id,
          formedAt: fvg.formedAt,
          validatedAt: candle.time,
          suggestedSide: fvg.direction === 'bullish' ? 'buy' : 'sell',
        });
        continue; // consumed - do not keep watching this one
      }

      // Fully filled through the zone without a clean reaction candle counted above still
      // reads as "entered" above, so this branch only handles pure staleness.
      if (fvg.candlesSinceFormed >= this.maxAgeCandles) {
        events.push({
          type: 'expired',
          symbol: this.symbol,
          direction: fvg.direction,
          zone: { top: fvg.top, bottom: fvg.bottom },
          id: fvg.id,
        });
        continue;
      }

      stillActive.push(fvg);
    }
    this.active = stillActive;

    // 2) Detect a brand-new FVG using the last 3 candles (c1, c2, c3 = this candle).
    this.history.push(candle);
    if (this.history.length > 3) this.history.shift();

    if (this.history.length === 3) {
      const [c1, , c3] = this.history;

      if (c1.high < c3.low) {
        const fvg = {
          id: `${this.symbol}-${++this._idCounter}`,
          direction: 'bullish',
          top: c3.low,
          bottom: c1.high,
          formedAt: c3.time,
          candlesSinceFormed: 0,
        };
        this.active.push(fvg);
        events.push({
          type: 'watching',
          symbol: this.symbol,
          direction: fvg.direction,
          zone: { top: fvg.top, bottom: fvg.bottom },
          id: fvg.id,
          formedAt: fvg.formedAt,
        });
      } else if (c1.low > c3.high) {
        const fvg = {
          id: `${this.symbol}-${++this._idCounter}`,
          direction: 'bearish',
          top: c1.low,
          bottom: c3.high,
          formedAt: c3.time,
          candlesSinceFormed: 0,
        };
        this.active.push(fvg);
        events.push({
          type: 'watching',
          symbol: this.symbol,
          direction: fvg.direction,
          zone: { top: fvg.top, bottom: fvg.bottom },
          id: fvg.id,
          formedAt: fvg.formedAt,
        });
      }
    }

    return events;
  }

  getActiveFvgs() {
    return [...this.active];
  }
}
