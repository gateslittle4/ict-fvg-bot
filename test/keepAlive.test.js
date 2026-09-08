import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKeepAliveConfig, startKeepAlive, isMarketOpen } from '../src/keepAlive.js';

const silentLog = { log() {}, warn() {} };

test('resolveKeepAliveConfig: disabled unless KEEP_ALIVE is exactly "true"', () => {
  for (const value of [undefined, '', 'false', '1', 'yes', 'TRUE']) {
    const cfg = resolveKeepAliveConfig({ KEEP_ALIVE: value, RENDER_EXTERNAL_URL: 'https://x.onrender.com' });
    assert.equal(cfg.enabled, false, `KEEP_ALIVE=${JSON.stringify(value)} must not enable it`);
  }
});

test('resolveKeepAliveConfig: enabled on Render, pinging the service\'s own /healthz', () => {
  const cfg = resolveKeepAliveConfig({ KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://ict-fvg-bot.onrender.com' });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.url, 'https://ict-fvg-bot.onrender.com/healthz');
});

test('resolveKeepAliveConfig: a trailing slash on the base URL does not produce a double slash', () => {
  const cfg = resolveKeepAliveConfig({ KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://ict-fvg-bot.onrender.com/' });
  assert.equal(cfg.url, 'https://ict-fvg-bot.onrender.com/healthz');
});

test('resolveKeepAliveConfig: explicit KEEP_ALIVE_URL wins over RENDER_EXTERNAL_URL', () => {
  const cfg = resolveKeepAliveConfig({
    KEEP_ALIVE: 'true',
    KEEP_ALIVE_URL: 'https://elsewhere.example',
    RENDER_EXTERNAL_URL: 'https://ict-fvg-bot.onrender.com',
  });
  assert.equal(cfg.url, 'https://elsewhere.example/healthz');
});

test('resolveKeepAliveConfig: enabled but with no URL to ping stays disabled (the normal local case), with a reason', () => {
  const cfg = resolveKeepAliveConfig({ KEEP_ALIVE: 'true' });
  assert.equal(cfg.enabled, false);
  assert.match(cfg.reason, /RENDER_EXTERNAL_URL/);
});

test('resolveKeepAliveConfig: default interval is 10 minutes - safely under Render\'s ~15 min idle shutdown', () => {
  const cfg = resolveKeepAliveConfig({ KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com' });
  assert.equal(cfg.intervalMs, 10 * 60 * 1000);
});

test('resolveKeepAliveConfig: interval is clamped to at most 14 min, so a bad value can never let the instance fall asleep between pings', () => {
  const cfg = resolveKeepAliveConfig({ KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com', KEEP_ALIVE_MINUTES: '60' });
  assert.equal(cfg.intervalMs, 14 * 60 * 1000);
});

test('resolveKeepAliveConfig: a non-numeric interval falls back to the default rather than NaN', () => {
  const cfg = resolveKeepAliveConfig({ KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com', KEEP_ALIVE_MINUTES: 'soon' });
  assert.equal(cfg.intervalMs, 10 * 60 * 1000);
});

test('startKeepAlive: returns null and pings nothing when disabled', () => {
  let called = 0;
  const timer = startKeepAlive({ env: {}, fetchImpl: async () => { called++; }, log: silentLog });
  assert.equal(timer, null);
  assert.equal(called, 0);
});

test('startKeepAlive: pings the health URL on each interval tick', async () => {
  const urls = [];
  const timer = startKeepAlive({
    env: { KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com', KEEP_ALIVE_MINUTES: '1' },
    fetchImpl: async (url) => { urls.push(url); return { ok: true, status: 200 }; },
    log: silentLog,
  });
  assert.ok(timer, 'expected a timer handle');

  // Drive the timer directly rather than waiting a real minute.
  await timer._onTimeout();
  await timer._onTimeout();
  clearInterval(timer);

  assert.deepEqual(urls, ['https://x.onrender.com/healthz', 'https://x.onrender.com/healthz']);
});

test('startKeepAlive: a failing ping is swallowed (a network blip must never take down a running bot)', async () => {
  const warnings = [];
  const timer = startKeepAlive({
    env: { KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com' },
    fetchImpl: async () => { throw new Error('ECONNRESET'); },
    log: { log() {}, warn: (...args) => warnings.push(args.join(' ')) },
  });

  await timer._onTimeout(); // must not reject
  clearInterval(timer);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ECONNRESET/);
});

test('startKeepAlive: a non-OK HTTP response is logged but not thrown', async () => {
  const warnings = [];
  const timer = startKeepAlive({
    env: { KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com' },
    fetchImpl: async () => ({ ok: false, status: 503 }),
    log: { log() {}, warn: (...args) => warnings.push(args.join(' ')) },
  });

  await timer._onTimeout();
  clearInterval(timer);

  assert.match(warnings[0], /503/);
});

// --- Market-hours gate ------------------------------------------------------
// The bot cannot trade a closed market, so pinging it awake through the
// weekend is pure waste of Render's free instance-hours. These use REAL
// timestamps around the boundaries, in both DST (EDT, UTC-4) and standard
// time (EST, UTC-5), because the whole point is that the boundary is a New
// York WALL-CLOCK hour, not a fixed UTC offset.


test('isMarketOpen: closed all day Saturday', () => {
  assert.equal(isMarketOpen(Date.parse('2026-09-05T12:00:00Z')), false); // Sat 08:00 NY (EDT)
  assert.equal(isMarketOpen(Date.parse('2026-09-05T23:00:00Z')), false); // Sat 19:00 NY
});

test('isMarketOpen: Sunday is closed before 17:00 NY and open after', () => {
  assert.equal(isMarketOpen(Date.parse('2026-09-06T20:00:00Z')), false); // Sun 16:00 NY (EDT) - still closed
  assert.equal(isMarketOpen(Date.parse('2026-09-06T21:00:00Z')), true); // Sun 17:00 NY - opens
  assert.equal(isMarketOpen(Date.parse('2026-09-06T23:30:00Z')), true); // Sun 19:30 NY
});

test('isMarketOpen: Friday is open before 17:00 NY and closed after', () => {
  assert.equal(isMarketOpen(Date.parse('2026-09-04T20:00:00Z')), true); // Fri 16:00 NY (EDT)
  assert.equal(isMarketOpen(Date.parse('2026-09-04T21:00:00Z')), false); // Fri 17:00 NY - closes
});

test('isMarketOpen: open right through the middle of the week, including overnight', () => {
  assert.equal(isMarketOpen(Date.parse('2026-09-08T14:30:00Z')), true); // Tue 10:30 NY
  assert.equal(isMarketOpen(Date.parse('2026-09-09T06:00:00Z')), true); // Wed 02:00 NY (Asian session - Divergence can still fire)
});

test('isMarketOpen: the boundary follows NEW YORK wall-clock time, not a fixed UTC offset (winter/EST check)', () => {
  // In January New York is on EST (UTC-5), so Friday 17:00 NY is 22:00 UTC,
  // an hour later in UTC than the same wall-clock boundary in September.
  assert.equal(isMarketOpen(Date.parse('2026-01-09T21:30:00Z')), true); // Fri 16:30 NY (EST) - still open
  assert.equal(isMarketOpen(Date.parse('2026-01-09T22:00:00Z')), false); // Fri 17:00 NY (EST) - closed
});

test('startKeepAlive: skips the ping while the market is closed, resumes when it reopens', async () => {
  const urls = [];
  let fakeNow = Date.parse('2026-09-05T12:00:00Z'); // Saturday - closed
  const timer = startKeepAlive({
    env: { KEEP_ALIVE: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com' },
    fetchImpl: async (url) => { urls.push(url); return { ok: true, status: 200 }; },
    log: silentLog,
    now: () => fakeNow,
  });

  await timer._onTimeout();
  assert.deepEqual(urls, [], 'must not ping while the market is closed');

  fakeNow = Date.parse('2026-09-08T14:30:00Z'); // Tuesday 10:30 NY - open
  await timer._onTimeout();
  clearInterval(timer);
  assert.deepEqual(urls, ['https://x.onrender.com/healthz'], 'must ping once the market is open');
});

test('startKeepAlive: KEEP_ALIVE_ALWAYS=true ignores the market-hours gate', async () => {
  const urls = [];
  const timer = startKeepAlive({
    env: { KEEP_ALIVE: 'true', KEEP_ALIVE_ALWAYS: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com' },
    fetchImpl: async (url) => { urls.push(url); return { ok: true, status: 200 }; },
    log: silentLog,
    now: () => Date.parse('2026-09-05T12:00:00Z'), // Saturday - closed, but gate is off
  });

  await timer._onTimeout();
  clearInterval(timer);
  assert.equal(urls.length, 1);
});
