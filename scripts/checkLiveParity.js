#!/usr/bin/env node
// checkLiveParity.js - contrôle hebdomadaire : le bot en direct a-t-il traité les mêmes signaux que le moteur sur les bougies complètes ?
//
// Usage :
//   ADMIN_EXPORT_TOKEN=... node scripts/checkLiveParity.js --days 7 [--from ISO --to ISO] [--events events.json] [--candles-dir dossier] [--out rapport.md]
//   - bougies : exportées du broker via /admin/export-candles (jeton ADMIN_EXPORT_TOKEN, URL BOT_URL, défaut la prod) ou lues dans --candles-dir (CSV <PAIRE>.csv, UTC réel)
//   - signaux traités en direct : --events (JSON [{event_time|timeMs, symbol, source, side}]) ou, sans --events, la table bot_order_events
//     lue avec SUPABASE_URL + SUPABASE_SERVICE_KEY (mêmes variables que le serveur)
// Le jeton n'est jamais écrit dans le rapport. Voir docs/LIVE_DATA_FLOW.md.
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { replaySignals, compareSignals, fmtUtc } from '../src/backtest/liveParity.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const days = Number(opt('days', 7));
const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const BOT_URL = process.env.BOT_URL || 'https://ict-fvg-bot.onrender.com';
const toMs = opt('to') ? Date.parse(opt('to')) : Date.now();
const fromMs = opt('from') ? Date.parse(opt('from')) : toMs - days * 86400000;

async function loadCandles() {
  const dir = opt('candles-dir');
  const out = {};
  for (const s of SYMBOLS) {
    if (dir) { out[s] = loadCandlesFromCsv(path.join(dir, `${s}.csv`)).candles; continue; }
    const token = process.env.ADMIN_EXPORT_TOKEN;
    if (!token) throw new Error('ADMIN_EXPORT_TOKEN manquant (ou utilise --candles-dir)');
    const res = await fetch(`${BOT_URL}/api/accounts/default/admin/export-candles?symbol=${s}&timeframe=M15&days=${Math.max(days + 90, 120)}&token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(`export ${s}: HTTP ${res.status}`);
    const tmp = path.join(process.env.TMPDIR || '/tmp', `parity-${s}.csv`);
    fs.writeFileSync(tmp, await res.text());
    out[s] = loadCandlesFromCsv(tmp).candles;
    fs.rmSync(tmp, { force: true });
  }
  return out;
}

async function loadLive() {
  const file = opt('events');
  let rows;
  if (file) rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('--events ou SUPABASE_URL + SUPABASE_SERVICE_KEY requis');
    const q = `${url}/rest/v1/bot_order_events?event=eq.signal&event_time=gte.${new Date(fromMs).toISOString()}&select=event_time,symbol,source,side&order=event_time.asc&limit=1000`;
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase: HTTP ${res.status}`);
    rows = await res.json();
  }
  return rows.map((r) => ({ timeMs: r.timeMs ?? Date.parse(r.event_time), symbol: r.symbol, source: r.source, side: r.side })).filter((r) => r.timeMs >= fromMs && r.timeMs <= toMs);
}

const candles = await loadCandles();
const live = await loadLive();
const replay = replaySignals(candles, { fromMs, toMs });
const cmp = compareSignals(replay, live);
const clean = replay.filter((r) => !r.blocked);

const md = [];
md.push(`# Contrôle direct / rejeu — ${fmtUtc(fromMs)} → ${fmtUtc(toMs)} UTC`, '');
md.push(`Signaux propres au rejeu (moteur sur bougies complètes) : **${clean.length}** · traités en direct : **${live.length}** · **concordants : ${cmp.matched.length}** · manquants en direct : **${cmp.missingInLive.length}** · en direct mais pas au rejeu : **${cmp.extraInLive.length}**.`, '');
const row = (s) => `| ${fmtUtc(s.timeMs)} | ${s.symbol} | ${s.source} | ${s.side} |`;
md.push('## Manquants en direct (le moteur aurait dû traiter)', '', '| Heure UTC | Paire | Mécanisme | Sens |', '|---|---|---|---|', ...(cmp.missingInLive.length ? cmp.missingInLive.map((s) => `${row(s)}`) : ['| — | | | |']), '');
md.push('## En direct mais absents du rejeu', '', '| Heure UTC | Paire | Mécanisme | Sens | Raison au rejeu |', '|---|---|---|---|---|', ...(cmp.extraInLive.length ? cmp.extraInLive.map((s) => `${row(s)} ${s.replayBlockedReason ? `bloqué : ${s.replayBlockedReason}` : 'aucun signal'} |`) : ['| — | | | | |']), '');
md.push('## Comment lire', '', '- **Manquants** : signal valide au rejeu sans trace d\'ordre. Causes connues : serveur endormi/redémarré (voir `docs/LIVE_DATA_FLOW.md`), historique live faussé (corrigé le 2026-09-21), auto-exécution coupée, ou blocage réel chez le broker. Vérifier d\'abord les journaux Render autour de l\'heure.',
  '- **Absents du rejeu** : le bot a traité un signal que le moteur complet ne voit pas (bougies fausses en direct, ou croyance de position différente : `netting`).',
  '- Le rejeu ne connaît pas les positions réelles du broker : un `netting` au rejeu peut être un faux écart. Tolérance d\'heure : 3 minutes.');
const out = opt('out', path.join('data', 'live-parity', `parity-${new Date().toISOString().slice(0, 10)}.md`));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md.join('\n'));
console.log(md.join('\n'));
console.error(`Wrote ${out}`);
