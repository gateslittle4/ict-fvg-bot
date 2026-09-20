import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadResearchMemory, queryResearchMemory, addEntry, validateEntry } from '../src/backtest/researchMemory.js';

const good = { id: 'x-1', title: 'Titre', date: '2026-09-20', status: 'rejected', summary: 'Résumé' };
const tmpFile = (content) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rm-')), 'mem.json'); fs.writeFileSync(f, JSON.stringify(content)); return f; };

test('validateEntry accepts a well-formed entry and names every problem of a bad one', () => {
  assert.deepEqual(validateEntry(good), []);
  const errs = validateEntry({ id: '', title: 'T', date: '20/09/2026', status: 'maybe', summary: 'S', markets: 'US100' });
  assert.ok(errs.some((e) => /id/.test(e)));
  assert.ok(errs.some((e) => /YYYY-MM-DD/.test(e)));
  assert.ok(errs.some((e) => /status/.test(e)));
  assert.ok(errs.some((e) => /markets/.test(e)));
  assert.deepEqual(validateEntry(null), ['entry must be an object']);
});

test('the real store on disk is valid: every entry well-formed, ids unique, dates ISO', () => {
  const entries = loadResearchMemory();
  assert.ok(entries.length >= 10);
  const ids = new Set();
  for (const e of entries) { assert.deepEqual(validateEntry(e), [], e.id); assert.equal(ids.has(e.id), false, `duplicate ${e.id}`); ids.add(e.id); }
});

test('the store records the conclusions that were overturned, so they are not re-litigated', () => {
  const entries = loadResearchMemory();
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.equal(byId['atr-stop-floor'].status, 'rejected');
  assert.equal(byId['mechanism-pruning'].status, 'rejected');
  assert.equal(byId['entry-candle-stop-bug'].status, 'methodology-fix');
  assert.equal(byId['m15-tie-rule-bias'].status, 'methodology-fix');
  assert.equal(byId['live-eight-mechanisms'].status, 'live');
});

test('queryResearchMemory filters by status, market and text, most recent first', () => {
  const list = [
    { ...good, id: 'a', date: '2026-01-01', status: 'rejected', markets: ['US100'], summary: 'Plancher ATR' },
    { ...good, id: 'b', date: '2026-03-01', status: 'rejected', markets: ['us500'], summary: 'Autre' },
    { ...good, id: 'c', date: '2026-02-01', status: 'live', markets: ['US100'], summary: 'Live', knownWeaknesses: 'petit échantillon' },
  ];
  assert.deepEqual(queryResearchMemory(list, { status: 'rejected' }).map((e) => e.id), ['b', 'a']);
  assert.deepEqual(queryResearchMemory(list, { market: 'US500' }).map((e) => e.id), ['b']); // case-insensitive
  assert.deepEqual(queryResearchMemory(list, { text: 'atr' }).map((e) => e.id), ['a']);
  assert.deepEqual(queryResearchMemory(list, { text: 'ÉCHANTILLON' }).map((e) => e.id), ['c']); // case-insensitive, accented capitals included
  assert.deepEqual(queryResearchMemory(list, { text: 'echantillon' }).map((e) => e.id), []); // but not accent-insensitive: exact substring otherwise
  assert.deepEqual(queryResearchMemory(list, { text: 'échantillon' }).map((e) => e.id), ['c']); // weaknesses are searchable
  assert.deepEqual(queryResearchMemory(list, { status: 'live', market: 'US100' }).map((e) => e.id), ['c']);
  assert.equal(queryResearchMemory(list).length, 3);
});

test('addEntry validates, refuses duplicates and never corrupts the file', () => {
  const f = tmpFile([good]);
  assert.throws(() => addEntry({ ...good }, f), /duplicate/);
  assert.throws(() => addEntry({ id: 'y', title: 't' }, f), /invalid/);
  assert.equal(loadResearchMemory(f).length, 1);
  addEntry({ ...good, id: 'x-2' }, f);
  assert.deepEqual(loadResearchMemory(f).map((e) => e.id), ['x-1', 'x-2']);
});

test('a missing or malformed file throws instead of silently returning nothing', () => {
  assert.throws(() => loadResearchMemory('/nonexistent/file.json'));
  assert.throws(() => loadResearchMemory(tmpFile({ not: 'an array' })), /array/);
});
