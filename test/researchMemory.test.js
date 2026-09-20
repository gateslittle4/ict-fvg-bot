import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateEntry,
  loadResearchMemory,
  queryResearchMemory,
  addEntry,
  RESEARCH_MEMORY_PATH,
} from '../src/backtest/researchMemory.js';

function baseEntry(overrides = {}) {
  return {
    id: 'test-entry',
    title: 'Test entry',
    date: '2026-01-01',
    status: 'live',
    summary: 'A summary.',
    ...overrides,
  };
}

function tempMemoryFile(entries) {
  const filePath = path.join(os.tmpdir(), `research-memory-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + '\n');
  return filePath;
}

test('validateEntry: a well-formed entry has no errors', () => {
  assert.deepEqual(validateEntry(baseEntry()), []);
});

test('validateEntry: an entry with optional markets/files arrays is still valid', () => {
  assert.deepEqual(validateEntry(baseEntry({ markets: ['US100'], files: ['src/config.js'] })), []);
});

test('validateEntry: flags missing/empty required fields', () => {
  const errors = validateEntry({ id: 'x', title: '', date: '2026-01-01', status: 'live', summary: 'ok' });
  assert.ok(errors.some((e) => e.includes('title')));
});

test('validateEntry: flags a non-object entry', () => {
  assert.deepEqual(validateEntry(null), ['entry must be an object']);
  assert.deepEqual(validateEntry('nope'), ['entry must be an object']);
});

test('validateEntry: flags an unknown status', () => {
  const errors = validateEntry(baseEntry({ status: 'not-a-real-status' }));
  assert.ok(errors.some((e) => e.includes('status')));
});

test('validateEntry: flags a malformed date', () => {
  const errors = validateEntry(baseEntry({ date: '2026/01/01' }));
  assert.ok(errors.some((e) => e.includes('date')));
});

test('validateEntry: flags markets/files that are not arrays', () => {
  const errors = validateEntry(baseEntry({ markets: 'US100', files: 'src/config.js' }));
  assert.ok(errors.some((e) => e.includes('markets')));
  assert.ok(errors.some((e) => e.includes('files')));
});

test('loadResearchMemory: the real data/research-memory.json is a valid array of well-formed entries with unique ids', () => {
  const entries = loadResearchMemory(RESEARCH_MEMORY_PATH);
  assert.ok(Array.isArray(entries));
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.deepEqual(validateEntry(entry), [], `entry "${entry.id}" should be valid`);
  }
  const ids = entries.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
});

test('loadResearchMemory: throws if the file does not contain a JSON array', () => {
  const filePath = tempMemoryFile({});
  fs.writeFileSync(filePath, JSON.stringify({ not: 'an array' }));
  assert.throws(() => loadResearchMemory(filePath), /must contain a JSON array/);
  fs.unlinkSync(filePath);
});

test('queryResearchMemory: filters by status', () => {
  const entries = [
    baseEntry({ id: 'a', status: 'live', date: '2026-01-01' }),
    baseEntry({ id: 'b', status: 'rejected', date: '2026-01-02' }),
  ];
  const result = queryResearchMemory(entries, { status: 'rejected' });
  assert.deepEqual(result.map((e) => e.id), ['b']);
});

test('queryResearchMemory: filters by market, case-insensitively', () => {
  const entries = [
    baseEntry({ id: 'a', markets: ['US100'], date: '2026-01-01' }),
    baseEntry({ id: 'b', markets: ['EURUSD'], date: '2026-01-02' }),
  ];
  const result = queryResearchMemory(entries, { market: 'us100' });
  assert.deepEqual(result.map((e) => e.id), ['a']);
});

test('queryResearchMemory: filters by text against title/summary/knownWeaknesses, case-insensitively', () => {
  const entries = [
    baseEntry({ id: 'a', title: 'Anchored VWAP study', date: '2026-01-01' }),
    baseEntry({ id: 'b', summary: 'mentions vwap here', date: '2026-01-02' }),
    baseEntry({ id: 'c', knownWeaknesses: 'weak on VWAP edge cases', date: '2026-01-03' }),
    baseEntry({ id: 'd', title: 'unrelated', summary: 'unrelated', date: '2026-01-04' }),
  ];
  const result = queryResearchMemory(entries, { text: 'vwap' });
  assert.deepEqual(result.map((e) => e.id).sort(), ['a', 'b', 'c']);
});

test('queryResearchMemory: combines filters (AND) and sorts most-recent date first', () => {
  const entries = [
    baseEntry({ id: 'a', status: 'live', markets: ['US100'], date: '2026-01-01' }),
    baseEntry({ id: 'b', status: 'live', markets: ['US100'], date: '2026-03-01' }),
    baseEntry({ id: 'c', status: 'rejected', markets: ['US100'], date: '2026-02-01' }),
  ];
  const result = queryResearchMemory(entries, { status: 'live', market: 'US100' });
  assert.deepEqual(result.map((e) => e.id), ['b', 'a']);
});

test('queryResearchMemory: with no filters, returns all entries sorted most-recent first', () => {
  const entries = [
    baseEntry({ id: 'a', date: '2026-01-01' }),
    baseEntry({ id: 'b', date: '2026-03-01' }),
    baseEntry({ id: 'c', date: '2026-02-01' }),
  ];
  const result = queryResearchMemory(entries);
  assert.deepEqual(result.map((e) => e.id), ['b', 'c', 'a']);
});

test('addEntry: appends a valid entry and persists it to disk', () => {
  const filePath = tempMemoryFile([baseEntry({ id: 'existing' })]);
  const updated = addEntry(baseEntry({ id: 'new-one' }), filePath);
  assert.deepEqual(updated.map((e) => e.id), ['existing', 'new-one']);
  const onDisk = loadResearchMemory(filePath);
  assert.deepEqual(onDisk.map((e) => e.id), ['existing', 'new-one']);
  fs.unlinkSync(filePath);
});

test('addEntry: throws on an invalid entry and does not write the file', () => {
  const filePath = tempMemoryFile([baseEntry({ id: 'existing' })]);
  const before = fs.readFileSync(filePath, 'utf8');
  assert.throws(() => addEntry(baseEntry({ id: 'bad', status: 'nope' }), filePath), /invalid research-memory entry/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
  fs.unlinkSync(filePath);
});

test('addEntry: throws on a duplicate id and does not write the file', () => {
  const filePath = tempMemoryFile([baseEntry({ id: 'dup' })]);
  const before = fs.readFileSync(filePath, 'utf8');
  assert.throws(() => addEntry(baseEntry({ id: 'dup' }), filePath), /duplicate research-memory id/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
  fs.unlinkSync(filePath);
});
