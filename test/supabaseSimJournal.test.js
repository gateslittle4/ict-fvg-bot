import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJournalRow, saveSimJournal } from '../src/dataSources/supabaseSimJournal.js';

const body = { session: 'abcd1234-ef', blind: true, pairs: [{ id: 'US100', symbol: 'US100' }], entries: [{ kind: 'skip' }, { kind: 'trade' }] };

test('supabaseSimJournal.toJournalRow: one row per session, with the counts', () => {
  const { row, error } = toJournalRow(body);
  assert.equal(error, undefined);
  assert.equal(row.session, 'abcd1234-ef');
  assert.equal(row.entries, 2);
  assert.equal(row.symbols, 'US100');
  assert.equal(row.blind, true);
  assert.equal(row.payload, body);
});

test('supabaseSimJournal.toJournalRow: rejects a bad session or missing entries', () => {
  assert.ok(toJournalRow({ ...body, session: 'x' }).error);
  assert.ok(toJournalRow({ ...body, session: 'a b c d e f g h' }).error);
  assert.ok(toJournalRow({ session: 'abcd1234' }).error);
  assert.ok(toJournalRow(null).error);
});

test('supabaseSimJournal.saveSimJournal: upserts on the session; 503 without Supabase', async () => {
  const calls = [];
  const client = { from: (t) => ({ upsert: async (row, opts) => { calls.push({ t, row, opts }); return { error: null }; } }) };
  const r = await saveSimJournal(client, body);
  assert.equal(r.ok, true);
  assert.equal(calls[0].t, 'bot_sim_journal');
  assert.deepEqual(calls[0].opts, { onConflict: 'session' });
  assert.equal((await saveSimJournal(null, body)).status, 503);
});
