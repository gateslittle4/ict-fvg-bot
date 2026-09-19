import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMentorPrompt, answerTradeMentor, isChatConfigured } from '../src/chatAssistant.js';

test('buildMentorPrompt: gives the model the trade and ONLY the factual debrief lines', () => {
  const p = buildMentorPrompt(
    { symbol: 'US100', direction: 'bullish', source: 'fvg', rMultiple: 1.5 },
    { notes: [{ level: 'info', text: 'Entrée à 10h15 (New York).' }, { level: 'warn', text: 'Hors de la fenêtre de session du bot.' }] },
  );
  assert.match(p, /achat US100/);
  assert.match(p, /résultat 1\.5 R/);
  assert.match(p, /- Entrée à 10h15 \(New York\)\./);
  assert.match(p, /- Hors de la fenêtre de session du bot\./);
});

test('buildMentorPrompt: an unknown result is stated as unknown, never as a number', () => {
  const p = buildMentorPrompt({ symbol: 'XAUUSD', direction: 'bearish', source: null, rMultiple: null }, { notes: [] });
  assert.match(p, /vente XAUUSD/);
  assert.match(p, /résultat inconnu en R/);
  assert.match(p, /stratégie inconnue/);
});

test('answerTradeMentor: without an API key it refuses with the standard message instead of calling anything', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(isChatConfigured(), false);
    await assert.rejects(() => answerTradeMentor({ trade: { symbol: 'US100', direction: 'bullish' }, debrief: { notes: [] } }), /ANTHROPIC_API_KEY manquant/);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
