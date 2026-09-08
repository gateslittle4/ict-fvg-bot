import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKeepAliveConfig, startKeepAlive } from '../src/keepAlive.js';

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
