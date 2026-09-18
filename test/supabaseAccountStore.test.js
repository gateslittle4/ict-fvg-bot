import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveDynamicAccount } from '../src/dataSources/supabaseAccountStore.js';

// Minimal stand-in for supabase-js's chainable query builder, covering only
// the two calls saveDynamicAccount() makes: a select().eq().maybeSingle()
// lookup of the existing row, then an upsert(). Real network calls have no
// place in a unit test - see supabaseTradeLog.test.js's own fakeClient for
// the same convention.
function fakeClient({ existingRow = null, selectError = null, upsertError = null } = {}) {
  const upserted = [];
  return {
    upserted,
    from(table) {
      assert.equal(table, 'bot_accounts');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: existingRow, error: selectError }),
          }),
        }),
        upsert: async (row) => {
          upserted.push(row);
          return { error: upsertError };
        },
      };
    },
  };
}

test('saveDynamicAccount: a brand-new account stores whatever credentials it was given', async () => {
  const client = fakeClient({ existingRow: null });
  const result = await saveDynamicAccount({
    id: 'cti-1',
    broker: { clientId: 'abc', clientSecret: 'secret', accessToken: 'tok', accountId: '123' },
    matchTrader: {},
  }, client);
  assert.equal(result.ok, true);
  assert.deepEqual(client.upserted[0].broker, { clientId: 'abc', clientSecret: 'secret', accessToken: 'tok', accountId: '123' });
});

// The bug: accounts.html's "Ajouter / mettre à jour un compte" form always
// submits a fully-populated broker object, defaulting every untouched field
// to null. Before this fix, saving that payload to update an unrelated
// field (e.g. risk %) silently wiped the account's real stored credentials.
test('saveDynamicAccount: blank/null credential fields on an update do NOT wipe existing stored credentials', async () => {
  const client = fakeClient({
    existingRow: { broker: { clientId: 'abc', clientSecret: 'secret', accessToken: 'tok', accountId: '123' }, match_trader: {} },
  });
  const result = await saveDynamicAccount({
    id: 'cti-1',
    riskPctPerTrade: 0.75, // the only thing the user actually meant to change
    broker: { clientId: null, clientSecret: null, accessToken: null, accountId: null },
    matchTrader: {},
  }, client);
  assert.equal(result.ok, true);
  assert.deepEqual(client.upserted[0].broker, { clientId: 'abc', clientSecret: 'secret', accessToken: 'tok', accountId: '123' });
  assert.equal(client.upserted[0].risk_pct_per_trade, 0.75);
});

test('saveDynamicAccount: an explicitly provided new value DOES overwrite that one field, others untouched', async () => {
  const client = fakeClient({
    existingRow: { broker: { clientId: 'abc', clientSecret: 'secret', accessToken: 'tok', accountId: '123' }, match_trader: {} },
  });
  const result = await saveDynamicAccount({
    id: 'cti-1',
    broker: { clientId: null, clientSecret: null, accessToken: 'brand-new-token', accountId: null },
    matchTrader: {},
  }, client);
  assert.equal(result.ok, true);
  assert.deepEqual(client.upserted[0].broker, { clientId: 'abc', clientSecret: 'secret', accessToken: 'brand-new-token', accountId: '123' });
});

test('saveDynamicAccount: a failed existing-row lookup is reported, never silently proceeds to upsert', async () => {
  const client = fakeClient({ selectError: { message: 'network blip' } });
  const result = await saveDynamicAccount({ id: 'cti-1', broker: {}, matchTrader: {} }, client);
  assert.equal(result.ok, false);
  assert.match(result.error, /network blip/);
  assert.equal(client.upserted.length, 0);
});

test('saveDynamicAccount: still requires an id', async () => {
  const result = await saveDynamicAccount({ broker: {} }, fakeClient());
  assert.equal(result.ok, false);
});
