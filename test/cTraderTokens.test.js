import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeWithRefresh, refreshAccessToken, describeBrokerError, fingerprint, createBrokerTokenStore } from '../src/dataSources/cTraderTokens.js';

const quiet = { log() {}, warn() {}, error() {} };
const okFetch = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
const creds = { clientId: 'cid', clientSecret: 'sec', accessToken: 'old-access', refreshToken: 'old-refresh' };
const memStore = (initial = null) => { const s = { rec: initial, saved: [], async load() { return this.rec; }, async save(k, r) { this.saved.push([k, r]); this.rec = r; } }; return s; };

test('describeBrokerError : objet sans message, code et description, jamais de jeton', () => {
  assert.equal(describeBrokerError(undefined), 'erreur inconnue (undefined)');
  assert.match(describeBrokerError({ errorCode: 'CH_ACCESS_TOKEN_INVALID', description: 'Access token is not valid' }), /CH_ACCESS_TOKEN_INVALID.*not valid/);
  assert.equal(describeBrokerError(new Error('boom')), 'boom');
  assert.ok(!describeBrokerError({ foo: 1, accessToken: 'SECRET123' }).includes('SECRET123'));
});

test('refreshAccessToken : succès, expiration calculée, refreshToken renouvelé', async () => {
  const r = await refreshAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'r', now: 1000, fetchImpl: okFetch({ accessToken: 'A2', refreshToken: 'R2', expiresIn: 2628000 }) });
  assert.deepEqual(r, { accessToken: 'A2', refreshToken: 'R2', expiresAt: 1000 + 2628000 * 1000 });
});

test('refreshAccessToken : refus de cTrader -> erreur lisible', async () => {
  await assert.rejects(refreshAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl: okFetch({ errorCode: 'ACCESS_DENIED', description: 'bad refresh' }, 400) }), /ACCESS_DENIED bad refresh/);
});

test('jeton valide : aucun renouvellement', async () => {
  let fetched = 0;
  const r = await authorizeWithRefresh({ authFn: async () => {}, creds, store: memStore(), accountKey: 'k', fetchImpl: async () => { fetched++; }, log: quiet });
  assert.equal(r.refreshed, false); assert.equal(r.accessToken, 'old-access'); assert.equal(fetched, 0);
});

test('jeton refusé : renouvelle, réessaie avec le nouveau, enregistre les deux jetons', async () => {
  const tried = [];
  const store = memStore();
  const r = await authorizeWithRefresh({
    authFn: async (t) => { tried.push(t); if (t === 'old-access') throw { errorCode: 'CH_ACCESS_TOKEN_INVALID' }; },
    creds, store, accountKey: 'default:1', now: 5000, log: quiet,
    fetchImpl: okFetch({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 100 }),
  });
  assert.deepEqual(tried, ['old-access', 'new-access']);
  assert.equal(r.refreshed, true); assert.equal(r.accessToken, 'new-access');
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0][1].refreshToken, 'new-refresh');
  assert.equal(store.saved[0][1].envFingerprint, fingerprint('old-access'));
});

test('démarrage suivant : utilise les jetons stockés (même empreinte d\'environnement), sans renouveler', async () => {
  const store = memStore({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: 10 ** 15, envFingerprint: fingerprint('old-access') });
  const tried = [];
  const r = await authorizeWithRefresh({ authFn: async (t) => { tried.push(t); }, creds, store, accountKey: 'k', now: 1, log: quiet, fetchImpl: async () => { throw new Error('ne doit pas appeler'); } });
  assert.deepEqual(tried, ['new-access']); assert.equal(r.refreshed, false);
});

test('jeton d\'environnement changé à la main : les jetons stockés sont ignorés', async () => {
  const store = memStore({ accessToken: 'stale', refreshToken: 'stale-r', expiresAt: 10 ** 15, envFingerprint: fingerprint('une-autre-valeur') });
  const tried = [];
  await authorizeWithRefresh({ authFn: async (t) => { tried.push(t); }, creds, store, accountKey: 'k', now: 1, log: quiet });
  assert.deepEqual(tried, ['old-access']);
});

test('expiration proche : renouvellement préventif avant la première autorisation', async () => {
  const store = memStore({ accessToken: 'a', refreshToken: 'r', expiresAt: 1000 + 3600 * 1000, envFingerprint: fingerprint('old-access') });
  const tried = [];
  await authorizeWithRefresh({ authFn: async (t) => { tried.push(t); }, creds, store, accountKey: 'k', now: 1000, log: quiet, fetchImpl: okFetch({ accessToken: 'fresh', refreshToken: 'r2', expiresIn: 2592000 }) });
  assert.deepEqual(tried, ['fresh']);
});

test('sans refreshToken : erreur claire (plus de « undefined »)', async () => {
  await assert.rejects(authorizeWithRefresh({ authFn: async () => { throw { errorCode: 'CH_ACCESS_TOKEN_INVALID' }; }, creds: { ...creds, refreshToken: null }, store: null, accountKey: 'k', log: quiet }), /CH_ACCESS_TOKEN_INVALID.*CTRADER_REFRESH_TOKEN/);
});

test('renouvellement refusé : l\'erreur dit pourquoi, pas de deuxième autorisation', async () => {
  let calls = 0;
  await assert.rejects(authorizeWithRefresh({ authFn: async () => { calls++; throw { errorCode: 'X' }; }, creds, store: null, accountKey: 'k', log: quiet, fetchImpl: okFetch({ errorCode: 'INVALID_GRANT', description: 'expired' }, 400) }), /renouvellement impossible.*INVALID_GRANT/);
  assert.equal(calls, 1);
});

test('stockage en panne : le jeton renouvelé sert quand même et l\'avertissement est émis', async () => {
  const errors = [];
  const store = { async load() { return null; }, async save() { throw new Error('table absente'); } };
  const r = await authorizeWithRefresh({
    authFn: async (t) => { if (t === 'old-access') throw new Error('refusé'); }, creds, store, accountKey: 'k', now: 1,
    log: { log() {}, warn() {}, error: (m) => errors.push(m) }, fetchImpl: okFetch({ accessToken: 'n', refreshToken: 'nr', expiresIn: 10 }),
  });
  assert.equal(r.refreshed, true);
  assert.ok(errors.some((m) => /NON enregistré/.test(m) && !/\bnr\b/.test(m)));
});

test('createBrokerTokenStore : null sans client Supabase', () => assert.equal(createBrokerTokenStore(null), null));
