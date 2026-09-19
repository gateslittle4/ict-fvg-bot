import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTradeDebrief, sessionsAt } from '../src/backtest/tradeDebrief.js';

// January = standard time: engine hour == New York hour.
const MIN15 = 900000;
const DAY = 86400000;
const D0 = Date.UTC(2020, 0, 6); // Monday
const at = (day, hour, minute = 0) => D0 + day * DAY + (hour * 60 + minute) * 60000;

// Three weekdays of flat M15 candles at 100; yesterday (day 1) has a 100.1 high.
function market() {
  const c = [];
  for (let d = 0; d < 3; d++) {
    for (let q = 0; q < 96; q++) {
      const t = D0 + d * DAY + q * MIN15;
      c.push({ time: t, open: 100, high: d === 1 && q === 40 ? 100.1 : 100.02, low: 99.98, close: 100 });
    }
  }
  return c;
}
const trade = (over = {}) => ({ symbol: 'US100', direction: 'bullish', source: 'fvg', entryPrice: 100, exitPrice: 100.4, rMultiple: 1.5, pnl: 50, ...over });
const run = (t, entry, exit, extra = {}) => buildTradeDebrief({ trade: t, candles: market(), entryEngine: entry, exitEngine: exit, ...extra });
const texts = (r) => r.notes.map((n) => n.text).join(' | ');

test('sessionsAt: the session windows an instant falls in, in New York hours', () => {
  assert.deepEqual(sessionsAt(at(2, 10, 30)).map((s) => s.key).sort(), ['nyam', 'silver']);
  assert.deepEqual(sessionsAt(at(2, 3)).map((s) => s.key), ['london']);
  assert.deepEqual(sessionsAt(at(2, 6, 30)), []);
});

test('debrief: names the sessions the entry fell in', () => {
  const r = run(trade(), at(2, 10, 15), at(2, 12));
  assert.match(texts(r), /Entrée à 10h15 \(New York\)/);
  assert.match(texts(r), /Silver Bullet AM/);
});

test('debrief: checks the entry against the bot\'s own session window, good inside and a warning outside', () => {
  const cfg = { sessionWindow: { startHour: 8, endHour: 12 } };
  const inside = run(trade(), at(2, 10), at(2, 11), { config: cfg });
  assert.ok(inside.notes.some((n) => n.level === 'good' && /Dans la fenêtre de session du bot/.test(n.text)));
  const outside = run(trade(), at(2, 14), at(2, 15), { config: cfg });
  assert.ok(outside.notes.some((n) => n.level === 'warn' && /Hors de la fenêtre de session du bot/.test(n.text)));
  // a trade from another mechanism is not judged against the FVG window
  const other = run(trade({ source: 'nwog' }), at(2, 14), at(2, 15), { config: cfg });
  assert.ok(!other.notes.some((n) => /fenêtre de session du bot/.test(n.text)));
});

test('debrief: lists the key levels within 0.25 % of the entry, with the side they are on', () => {
  const exact = run(trade({ entryPrice: 100.1 }), at(2, 10), at(2, 11));
  assert.match(texts(exact), /Plus haut de la veille \(PDH\) \(au niveau exact\)/);
  const below = run(trade({ entryPrice: 100.2 }), at(2, 10), at(2, 11)); // 0.1 % above yesterday's high
  assert.match(texts(below), /Plus haut de la veille \(PDH\) \(0,10 % en dessous\)/);
  assert.ok(exact.facts.nearLevels.length >= 1 && exact.facts.nearLevels.length <= 3);
  const far = run(trade({ entryPrice: 130 }), at(2, 10), at(2, 11));
  assert.match(texts(far), /Aucun niveau clé/);
});

test('debrief: how far price went for and against the trade while it was open', () => {
  const t = trade({ entryPrice: 100 });
  const candles = market().map((c) => (c.time === at(2, 10, 30) ? { ...c, high: 100.5, low: 99.8 } : c));
  const r = buildTradeDebrief({ trade: t, candles, entryEngine: at(2, 10), exitEngine: at(2, 12) });
  assert.ok(Math.abs(r.facts.favourablePct - 0.5) < 1e-9);
  assert.ok(Math.abs(r.facts.adversePct - 0.2) < 1e-9);
  assert.match(texts(r), /jusqu'à 0,50 % en ta faveur et 0,20 % contre toi/);
});

test('debrief: a loser that had been well in profit is flagged, without turning it into a rule', () => {
  const candles = market().map((c) => (c.time === at(2, 10, 30) ? { ...c, high: 100.6 } : c));
  const r = buildTradeDebrief({ trade: trade({ rMultiple: -1, pnl: -40 }), candles, entryEngine: at(2, 10), exitEngine: at(2, 12) });
  assert.ok(r.notes.some((n) => n.level === 'warn' && /dans le vert/.test(n.text) && /sans en faire une règle/.test(n.text)));
});

test('debrief: a trade older than the candle history says so instead of inventing context', () => {
  const r = buildTradeDebrief({ trade: trade(), candles: market(), entryEngine: D0 - 40 * DAY, exitEngine: D0 - 40 * DAY + 3600000 });
  assert.match(texts(r), /Contexte de marché indisponible/);
  assert.equal(r.facts.favourablePct, undefined);
});

test('debrief: the historical context is worded by its verdict and always reminds that one trade proves nothing', () => {
  const ctx = (verdict) => ({ primary: { id: 'hour-direction', label: '10h New York · Achat', expectancy: 1.1, n: 80 }, baseline: { expectancy: 0.84 }, verdict });
  const above = run(trade(), at(2, 10), at(2, 11), { context: ctx('above') });
  const n = above.notes.find((x) => /Historiquement/.test(x.text));
  assert.equal(n.level, 'good');
  assert.match(n.text, /\+1,10R en moyenne sur 80 trades/);
  assert.match(n.text, /Un seul trade ne prouve rien/);
  assert.equal(run(trade(), at(2, 10), at(2, 11), { context: ctx('below') }).notes.find((x) => /Historiquement/.test(x.text)).level, 'warn');
  // the whole-strategy fallback is not presented as "comparable signals"
  const all = run(trade(), at(2, 10), at(2, 11), { context: { primary: { id: 'all' }, baseline: { expectancy: 0.8 }, verdict: 'baseline' } });
  assert.ok(!all.notes.some((x) => /Historiquement/.test(x.text)));
});

test('debrief: states the result in R when it is known, and stays silent about it when it is not', () => {
  assert.match(texts(run(trade({ rMultiple: -1 }), at(2, 10), at(2, 11))), /Résultat : −1,00R/);
  assert.ok(!/Résultat :/.test(texts(run(trade({ rMultiple: null }), at(2, 10), at(2, 11)))));
});
