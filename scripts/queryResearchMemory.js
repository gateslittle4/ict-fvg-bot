#!/usr/bin/env node
// queryResearchMemory.js - "a-t-on déjà testé ça ?" en une commande.
// Usage: node scripts/queryResearchMemory.js [--status rejected] [--market US100] [--text "plancher"] [--full]
import { loadResearchMemory, queryResearchMemory } from '../src/backtest/researchMemory.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const full = args.includes('--full');
const results = queryResearchMemory(loadResearchMemory(), { status: opt('status'), market: opt('market'), text: opt('text') });
if (!results.length) { console.log('Aucune entrée ne correspond.'); process.exit(0); }
for (const e of results) {
  console.log(`[${e.status}] ${e.date}  ${e.title}  (${e.id})`);
  console.log(`    ${full ? e.summary : e.summary.slice(0, 160) + (e.summary.length > 160 ? '…' : '')}`);
  if (full && e.knownWeaknesses) console.log(`    Limites : ${e.knownWeaknesses}`);
  if (full && e.files) console.log(`    Fichiers : ${e.files.join(', ')}`);
}
console.log(`\n${results.length} entrée(s).`);
