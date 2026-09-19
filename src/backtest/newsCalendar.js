// newsCalendar.js
// The project's real, sourced high-impact ("red") news events (newsEvents.js, 2024-2025 only),
// given NAMES so a chart can label them. newsEvents.js stores US releases as one flat list
// grouped by comments (CPI, NFP, FOMC, GDP, PCE, retail sales); the group sizes below mirror that
// list and are PINNED by a test (total and boundary dates) so an edit to the source cannot
// silently shift every label. Nothing here is guessed: outside 2024-2025 there is simply no event.

import { US_ET_EVENTS, ECB_CET_EVENTS, zonedTimeToUtc } from './newsEvents.js';

// [label, full name, how many consecutive entries of US_ET_EVENTS], in the order of the source list.
const US_GROUPS = [
  ['CPI', 'Inflation US (CPI)', 12],
  ['NFP', 'Emplois US (NFP)', 12],
  ['FOMC', 'Décision de la Fed (FOMC)', 8],
  ['CPI', 'Inflation US (CPI)', 11],
  ['NFP', 'Emplois US (NFP)', 11],
  ['FOMC', 'Décision de la Fed (FOMC)', 9],
  ['PIB', 'PIB US (estimation avancée)', 7],
  ['PCE', 'Inflation PCE US', 21],
  ['Ventes', 'Ventes au détail US', 23],
];

let cache = null;

/** Every known red-news event, real UTC instants, oldest first: {time, label, name, region}. */
export function newsCalendar() {
  if (cache) return cache;
  const out = [];
  let i = 0;
  for (const [label, name, n] of US_GROUPS) {
    for (const [y, m, d, hh, mm] of US_ET_EVENTS.slice(i, i + n)) {
      out.push({ time: zonedTimeToUtc(y, m, d, hh, mm, 'America/New_York'), label, name, region: 'US' });
    }
    i += n;
  }
  for (const [y, m, d, hh, mm] of ECB_CET_EVENTS) {
    out.push({ time: zonedTimeToUtc(y, m, d, hh, mm, 'Europe/Berlin'), label: 'BCE', name: 'Décision de la BCE', region: 'EU' });
  }
  cache = out.sort((a, b) => a.time - b.time);
  return cache;
}

export const NEWS_GROUPS_TOTAL = US_GROUPS.reduce((s, g) => s + g[2], 0);

/** Events with time in [fromMs, toMs] (real UTC ms). */
export function newsBetween(fromMs, toMs) {
  return newsCalendar().filter((e) => e.time >= fromMs && e.time <= toMs);
}

/** First and last date covered, so a page can say "annonces disponibles 2024-2025" instead of showing nothing. */
export function newsCoverage() {
  const all = newsCalendar();
  return { from: all[0].time, to: all[all.length - 1].time, count: all.length };
}
