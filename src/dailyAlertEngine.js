// dailyAlertEngine.js
// Suivi en MODE ALERTE (jamais d'ordre, jamais de position réelle) d'une stratégie candidate journalière — 2026-09-22, à la demande d'Esdras
// ("suis le en mode alerte") pour RSI(2)/US500 (voir HANDOFF.md et data/research-memory.json `prereg-batch3-results-2026-09-21`, t = 2,23,
// candidate mais NON adoptée). Entièrement DÉCOUPLÉ de LiveStrategyEngine : ne touche ni openPositions, ni le netting, ni le solde, ni aucun
// ordre. Il lit seulement l'historique M15 déjà retenu (le même que le moteur réel), reconstruit ses propres bougies journalières et calcule
// le signal RSI(2). Un événement 'entry'/'exit' n'est qu'une ligne à enregistrer pour comparer plus tard le signal à ce qui se serait passé -
// jamais une position suivie comme réelle.
//
// Règles reprises TELLES QUELLES du pré-enregistrement (data/backtest-input/preregistration-batch3-2026-09-21.md et
// scripts/runPreregBatch3.js, dont cette classe reproduit fidèlement la mécanique bar-par-bar, en flux plutôt qu'en boucle sur un tableau) :
// achat seul si RSI(2) < 10 ET clôture > moyenne 200 jours ; sortie si clôture > moyenne 5 jours ou après 10 jours ; stop à 3x ATR(14),
// vérifié « stop d'abord » sur la bougie du jour. Journée = 17:00 → 17:00 en TEMPS MOTEUR, reconstruite à partir des bougies M15 (déjà en
// temps moteur, comme le reste du projet).
//
// Séquence par bougie journalière qui se clôture (mêmes règles que runPreregBatch3.js, dérivées bar par bar plutôt que par indice de tableau) :
//   A) exécute la décision prise à la clôture du jour PRÉCÉDENT, à l'OUVERTURE de ce jour (entrée ou sortie sur signal/temps) ;
//   B) vérifie le stop sur le H/L de CE jour (couvre aussi une entrée faite le jour même, étape A) ;
//   C) une fois la bougie enregistrée, décide la prochaine action (entrée si plat, sortie si en position) à partir de SA clôture,
//      pour exécution à l'ouverture du jour suivant.

const DAY_MS = 24 * 60 * 60 * 1000;
const H17 = 17 * 60 * 60 * 1000;

function atrOf(bars, period) {
  const n = Math.min(period, bars.length - 1);
  if (n < 1) return null;
  let sum = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const c = bars[i], p = bars[i - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
  }
  return sum / n;
}
function smaOf(bars, period) {
  if (bars.length < period) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) sum += bars[i].close;
  return sum / period;
}
/** RSI(2) of the LAST bar (Wilder smoothing over the whole closed history, matching runPreregBatch3.js's rsi2Series). */
function rsi2Of(bars) {
  if (bars.length < 3) return null;
  let ag = 0, al = 0;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i === 1) { ag = g; al = l; } else { ag = (ag + g) / 2; al = (al + l) / 2; }
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

export class DailyAlertEngine {
  /**
   * @param {object} opts
   * @param {string} opts.strategy - label stored on every logged row, e.g. 'rsi2-daily'.
   * @param {string} opts.symbol
   * @param {number} [opts.rsiThreshold=10]
   * @param {number} [opts.smaTrend=200]
   * @param {number} [opts.smaExit=5]
   * @param {number} [opts.timeoutDays=10]
   * @param {number} [opts.stopAtrMultiple=3]
   * @param {number} [opts.atrPeriod=14]
   */
  constructor({ strategy, symbol, rsiThreshold = 10, smaTrend = 200, smaExit = 5, timeoutDays = 10, stopAtrMultiple = 3, atrPeriod = 14 } = {}) {
    if (!strategy || !symbol) throw new Error('DailyAlertEngine requires strategy and symbol');
    Object.assign(this, { strategy, symbol, rsiThreshold, smaTrend, smaExit, timeoutDays, stopAtrMultiple, atrPeriod });
    this.bars = []; // closed daily bars only, oldest first: {time, open, high, low, close}
    this._cur = null; // the day still forming: {key, time, open, high, low, close}
    this.position = null; // {direction:'bullish', entryPrice, entryTime, entryIndex, stopPrice, distance} | null
    this.pendingAction = null; // 'entry' | 'exit' | null - decided at the close of the last bar in `this.bars`
    this.pendingATR = null;
    this.pendingExitReason = null;
  }

  /** Feeds one M15 candle (engine time). Returns the events a daily bar close produces (usually empty - only the LAST M15 candle of a day triggers anything). `silent` (warm-up) suppresses events but still updates state, so a bulk history replay never floods the log. */
  ingest(candle, { silent = false } = {}) {
    const key = Math.floor((candle.time - H17) / DAY_MS);
    if (!this._cur || this._cur.key !== key) {
      const finished = this._cur;
      this._cur = { key, time: key * DAY_MS + H17, open: candle.open, high: candle.high, low: candle.low, close: candle.close };
      return finished ? this._onDailyBarClosed(finished, silent) : [];
    }
    this._cur.high = Math.max(this._cur.high, candle.high);
    this._cur.low = Math.min(this._cur.low, candle.low);
    this._cur.close = candle.close;
    return [];
  }

  /**
   * 2026-09-23 - live feeds each M15 bar on its FIRST tick (open only: high = low = close = open), so without this the forming day
   * was built from bar opens only: daily high/low missed every intrabar extreme and the close lagged 15 min - ATR (hence the 3xATR
   * stop) came out tighter than the backtest's. Called with the previous bar's FINAL values (broker-reconciled) before the next
   * bar's first tick is ingested: merges them into the forming day only when it is the same day, never opens or closes a day.
   */
  updateFormingBar(candle) {
    if (!this._cur || !candle) return;
    if (Math.floor((candle.time - H17) / DAY_MS) !== this._cur.key) return;
    this._cur.high = Math.max(this._cur.high, candle.high);
    this._cur.low = Math.min(this._cur.low, candle.low);
    this._cur.close = candle.close;
  }

  /** Bulk warm-up from the engine's already-retained M15 history: establishes bars/position state with NO logged events. */
  warmUp(m15Candles) {
    for (const c of m15Candles) this.ingest(c, { silent: true });
  }

  _onDailyBarClosed(bar, silent) {
    const events = [];

    // A) execute the PREVIOUS bar's decision at this bar's OPEN
    if (this.pendingAction === 'exit' && this.position) {
      events.push(this._exitEvent(bar, bar.open, this.pendingExitReason));
      this.position = null;
    } else if (this.pendingAction === 'entry' && !this.position && this.pendingATR > 0) {
      const distance = this.stopAtrMultiple * this.pendingATR;
      this.position = { direction: 'bullish', entryPrice: bar.open, entryTime: bar.time, entryIndex: this.bars.length, stopPrice: bar.open - distance, distance };
      events.push(this._entryEvent(bar));
    }
    this.pendingAction = null; this.pendingATR = null; this.pendingExitReason = null;

    // B) stop check on THIS bar's own H/L (also covers a position entered this same bar in step A)
    if (this.position && bar.low <= this.position.stopPrice) {
      const exitPrice = bar.open <= this.position.stopPrice ? bar.open : this.position.stopPrice; // gapped through -> fill at open, else at the stop
      events.push(this._exitEvent(bar, exitPrice, 'stop'));
      this.position = null;
    }

    this.bars.push(bar);
    const idx = this.bars.length - 1;

    // C) decide the NEXT action from this bar's close (executed at the next bar's open)
    if (this.position) {
      const sma5 = smaOf(this.bars, this.smaExit);
      if (sma5 !== null && bar.close > sma5) { this.pendingAction = 'exit'; this.pendingExitReason = 'sma5'; }
      else if (idx - this.position.entryIndex >= this.timeoutDays) { this.pendingAction = 'exit'; this.pendingExitReason = 'timeout'; }
    } else {
      const rsi = rsi2Of(this.bars), sma = smaOf(this.bars, this.smaTrend);
      if (rsi !== null && rsi < this.rsiThreshold && sma !== null && bar.close > sma) {
        this.pendingAction = 'entry';
        this.pendingATR = atrOf(this.bars, this.atrPeriod); // includes this decision bar, matching runPreregBatch3.js's atrSeries convention
      }
    }
    return silent ? [] : events;
  }

  _entryEvent(bar) {
    const p = this.position;
    return { strategy: this.strategy, symbol: this.symbol, event: 'entry', direction: p.direction, price: p.entryPrice, stopPrice: p.stopPrice, targetPrice: null, rMultiple: null, barTime: bar.time, detail: `RSI(2) < ${this.rsiThreshold}, clôture > SMA${this.smaTrend}` };
  }
  _exitEvent(bar, exitPrice, reason) {
    const p = this.position;
    const r = p.distance > 0 ? (exitPrice - p.entryPrice) / p.distance : null;
    return { strategy: this.strategy, symbol: this.symbol, event: 'exit', direction: p.direction, price: exitPrice, stopPrice: p.stopPrice, targetPrice: null, rMultiple: r, barTime: bar.time, detail: reason };
  }
}
