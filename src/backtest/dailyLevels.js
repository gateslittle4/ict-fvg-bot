// dailyLevels.js
// "Niveaux du jour" page (2026-09-18, Esdras: "on prend ... 7"): the reference
// prices the ICT mechanisms of this project trade around, gathered in one
// ladder around the current price - today's/yesterday's/last week's high and
// low, the New York midnight open, the Asian range, the CBDR and its 2-sigma
// projections, and the latest opening gaps. Every one reuses the production
// helper the strategy itself uses (computeAsianRanges, detectNwogEvents, ...),
// never a second implementation that could drift from what the bot trades.
//
// Input candles are ENGINE time (the live engine's retained M15 history uses
// the same fixed-UTC-5 convention as every backtest, see nySession.js). "Day"
// and "week" below are real New York calendar days/weeks (DST-aware).

import { toRealNyHourMinute, FIXED_EST_TO_UTC_OFFSET_MS } from './nySession.js';
import { computeAsianRanges, ASIAN_KILLZONE_WINDOW } from './asianRangeBreakout.js';
import { CBDR_WINDOW, STANDARD_DEVIATIONS } from './cbdr.js';
import { detectNwogEvents } from './nwog.js';
import { detectNdogEvents } from './ndog.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// A day/week with fewer candles than this is a partial one (Sunday evening
// reopen, a holiday stub) and must not stand in for "yesterday"/"last week".
const MIN_FULL_DAY_CANDLES = 24; // 6 h of M15
const MIN_FULL_WEEK_CANDLES = 200;

/** The windows the page draws on its 24 h timeline (NY local hours). */
export const SESSION_WINDOWS = [
  { key: 'cbdr', label: 'CBDR', startHour: CBDR_WINDOW.startHour, endHour: CBDR_WINDOW.endHour },
  { key: 'asia', label: 'Range asiatique', startHour: ASIAN_KILLZONE_WINDOW.startHour, endHour: ASIAN_KILLZONE_WINDOW.endHour },
  { key: 'london', label: 'Killzone Londres', startHour: 2, endHour: 5 },
  { key: 'silver', label: 'Silver Bullet AM', startHour: 10, endHour: 11 },
];

const nyDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'YYYY-MM-DD' of the real New York calendar day an engine-time candle falls in. */
export function nyDayKey(engineTime) {
  return nyDateFormatter.format(new Date(engineTime + FIXED_EST_TO_UTC_OFFSET_MS));
}

/** The Monday (YYYY-MM-DD) of the week that NY day belongs to. */
function weekKeyOf(dayKey) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

function groupExtremes(candles, keyOf) {
  const groups = new Map();
  for (const c of candles) {
    const k = keyOf(c);
    const g = groups.get(k);
    if (!g) groups.set(k, { key: k, high: c.high, low: c.low, count: 1 });
    else { if (c.high > g.high) g.high = c.high; if (c.low < g.low) g.low = c.low; g.count++; }
  }
  return groups;
}

const latestKey = (map) => [...map.keys()].sort((a, b) => a - b).pop();

/**
 * @param {Array<{time:number,open:number,high:number,low:number,close:number}>} candles - engine time, oldest first
 * @returns {null | {price:number, lastTime:number, levels:Array<{key:string,label:string,group:string,price:number,note?:string,distance:number,distancePct:number}>}}
 */
export function computeDailyLevels(candles) {
  if (!candles || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const price = last.close;
  const levels = [];
  const add = (key, label, group, value, note) => {
    if (Number.isFinite(value)) levels.push({ key, label, group, price: value, ...(note ? { note } : {}) });
  };

  // --- day / week extremes (real NY calendar) ---
  const today = nyDayKey(last.time);
  const days = groupExtremes(candles, (c) => nyDayKey(c.time));
  const t = days.get(today);
  if (t) {
    add('today-high', 'Plus haut du jour', 'Jour', t.high);
    add('today-low', 'Plus bas du jour', 'Jour', t.low);
  }
  const prevDay = [...days.values()].filter((g) => g.key < today && g.count >= MIN_FULL_DAY_CANDLES).sort((a, b) => (a.key < b.key ? -1 : 1)).pop();
  if (prevDay) {
    add('pdh', 'Plus haut de la veille (PDH)', 'Jour', prevDay.high, prevDay.key);
    add('pdl', 'Plus bas de la veille (PDL)', 'Jour', prevDay.low, prevDay.key);
    add('pd-mid', 'Équilibre de la veille (50 %)', 'Jour', (prevDay.high + prevDay.low) / 2, 'milieu PDH/PDL');
  }
  const thisWeek = weekKeyOf(today);
  const weeks = groupExtremes(candles, (c) => weekKeyOf(nyDayKey(c.time)));
  const prevWeek = [...weeks.values()].filter((g) => g.key < thisWeek && g.count >= MIN_FULL_WEEK_CANDLES).sort((a, b) => (a.key < b.key ? -1 : 1)).pop();
  if (prevWeek) {
    add('pwh', 'Plus haut de la semaine dernière (PWH)', 'Semaine', prevWeek.high, `semaine du ${prevWeek.key}`);
    add('pwl', 'Plus bas de la semaine dernière (PWL)', 'Semaine', prevWeek.low, `semaine du ${prevWeek.key}`);
  }

  // --- New York midnight open: the most recent 00:00 candle, at most a day old ---
  for (let i = candles.length - 1; i >= 0 && last.time - candles[i].time <= DAY_MS; i--) {
    const { hour, minute } = toRealNyHourMinute(candles[i].time);
    if (hour === 0 && minute === 0) {
      add('midnight-open', 'Ouverture de minuit (NY)', 'Sessions', candles[i].open);
      break;
    }
  }

  // --- Asian range and CBDR: the latest cycle, if it is recent enough to matter ---
  const RECENT = 36 * HOUR_MS;
  const inWindow = (w) => {
    const { hour } = toRealNyHourMinute(last.time);
    return hour >= w.startHour && hour < w.endHour;
  };
  const asian = computeAsianRanges(candles, { sessionWindow: ASIAN_KILLZONE_WINDOW });
  const asianKey = latestKey(asian);
  if (asianKey !== undefined && last.time - (asianKey + 1) * DAY_MS <= RECENT) {
    const r = asian.get(asianKey);
    const note = inWindow(ASIAN_KILLZONE_WINDOW) ? 'en formation' : 'terminé';
    add('asia-high', 'Range asiatique — haut', 'Sessions', r.high, note);
    add('asia-low', 'Range asiatique — bas', 'Sessions', r.low, note);
  }
  const cbdr = computeAsianRanges(candles, { sessionWindow: CBDR_WINDOW });
  const cbdrKey = latestKey(cbdr);
  if (cbdrKey !== undefined && last.time - (cbdrKey + 1) * DAY_MS <= RECENT) {
    const r = cbdr.get(cbdrKey);
    const height = r.high - r.low;
    const note = inWindow(CBDR_WINDOW) ? 'en formation' : 'terminé';
    add('cbdr-high', 'CBDR — haut', 'Sessions', r.high, note);
    add('cbdr-low', 'CBDR — bas', 'Sessions', r.low, note);
    if (height > 0) {
      add('cbdr-up', `CBDR — projection +${STANDARD_DEVIATIONS}σ`, 'Sessions', r.high + STANDARD_DEVIATIONS * height, 'zone de retournement');
      add('cbdr-down', `CBDR — projection −${STANDARD_DEVIATIONS}σ`, 'Sessions', r.low - STANDARD_DEVIATIONS * height, 'zone de retournement');
    }
  }

  // --- opening gaps (the levels the NWOG/NDOG mechanisms trade back to) ---
  const gapLevels = (events, keyPrefix, label, maxAgeMs) => {
    const e = events[events.length - 1];
    if (!e || last.time - candles[e.index].time > maxAgeMs) return;
    const prevClose = candles[e.index - 1].close;
    const open = candles[e.index].open;
    add(`${keyPrefix}-high`, `${label} — haut`, 'Gaps', Math.max(prevClose, open), 'clôture précédente / ouverture');
    add(`${keyPrefix}-low`, `${label} — bas`, 'Gaps', Math.min(prevClose, open), 'clôture précédente / ouverture');
  };
  gapLevels(detectNwogEvents(candles), 'nwog', 'Gap de semaine (NWOG)', 8 * DAY_MS);
  gapLevels(detectNdogEvents(candles), 'ndog', 'Gap du jour (NDOG)', 2 * DAY_MS);

  return rebaseLevels({ price, lastTime: last.time, levels }, price);
}

/**
 * The same levels measured from another price (the live tick, which moves far
 * more often than the 15-minute candles the levels are computed from - so the
 * expensive part is cached per candle and only this cheap part runs per request).
 */
export function rebaseLevels(result, price) {
  const levels = result.levels
    .map((l) => ({ ...l, distance: l.price - price, distancePct: price ? ((l.price - price) / price) * 100 : 0 }))
    .sort((a, b) => b.price - a.price);
  return { ...result, price, levels };
}
