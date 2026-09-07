import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { computeCorrelationMatrix } from '../src/backtest/correlation.js';

const { candles: us100 } = loadCandlesFromCsv('data/backtest-input/US100.csv');
const { candles: us500 } = loadCandlesFromCsv('data/backtest-input/US500.csv');
const { candles: gold } = loadCandlesFromCsv('data/backtest-input/XAUUSD.csv');

const { matrix, overlapCounts } = computeCorrelationMatrix({ US100: us100, US500: us500, XAUUSD: gold });
console.log(JSON.stringify(matrix, null, 2));
console.log('overlap:', JSON.stringify(overlapCounts, null, 2));
