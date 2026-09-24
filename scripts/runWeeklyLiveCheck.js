#!/usr/bin/env node
// runWeeklyLiveCheck.js - compare, trade par trade, ce que le bot a RÉELLEMENT fait une semaine à ce que le rejeu fidèle
// (runLiveReplay.js, config live) aurait fait sur les MÊMES bougies du courtier (2026-09-24, Esdras : « es-tu sûr à 100 % que le
// backtest voit ce que le bot voit réellement ? » -> « oui, mets-le en place »).
//
// Usage : node scripts/runWeeklyLiveCheck.js [--from AAAA-MM-JJ] [--to AAAA-MM-JJ]
//   défaut : la dernière semaine complète (dimanche 00:00 UTC -> samedi 00:00 UTC).
// Données, toutes publiques (aucun code administrateur) :
//   - bougies M15 du bot : GET /api/candles?symbol=X&limit=5000 (~10 semaines), ACCUMULÉES dans data/live-m15/<X>.csv.gz pour que la
//     série reste continue depuis la fin du M1 commité (data/real-m1-full, fin 2026-09-21) - lancer au moins une fois toutes les 10 semaines ;
//   - trades réels : GET /api/trade-history (historique du courtier, stratégie lue dans le label, R du journal Supabase).
// Sorties : data/live-check/week-<début>.md (détail) et data/live-check/history.json (une ligne par semaine, cumul dans le rapport).
// Limites déclarées : au-delà du M1 commité les sorties du rejeu sont vues en M15 (stop d'abord si stop et objectif dans la même
// bougie) ; spread par défaut ; GER40 n'est pas dans le rejeu. A et B y sont (même moteur et mêmes règles d'entrée que le bot).
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { OFF } from './lib/m1Data.js';
import { matchLiveAndReplay, summarizeCheck, mergeCandles } from './lib/liveCheck.js';

const BOT_URL = process.env.BOT_URL || 'https://ict-fvg-bot.onrender.com';
const SYMBOLS = ['US100', 'US500']; // les paires du rejeu (runLiveReplay.js : SYMS)
const DAY = 86400000, M15 = 900000;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

function defaultWeek(now = Date.now()) {
  const d = new Date(now); const sat = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 1) % 7) * DAY; // samedi 00:00 UTC <= now
  return { from: sat - 6 * DAY, to: sat };
}
const week = arg('--from') ? { from: Date.parse(arg('--from') + 'T00:00:00Z'), to: arg('--to') ? Date.parse(arg('--to') + 'T00:00:00Z') : Date.parse(arg('--from') + 'T00:00:00Z') + 6 * DAY } : defaultWeek();
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const ny = (ms) => ms == null ? '—' : new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)).replace(',', '');
const sgn = (x) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function readStore(sym, dir = 'data/live-m15') {
  const f = `${dir}/${sym}.csv.gz`;
  if (!fs.existsSync(f)) return [];
  return zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').trim().split('\n').slice(1).map((l) => { const [t, o, h, lo, c] = l.split(',').map(Number); return { time: t, open: o, high: h, low: lo, close: c }; });
}
function writeStore(sym, candles, dir = 'data/live-m15') {
  fs.mkdirSync(dir, { recursive: true });
  const csv = ['time,open,high,low,close', ...candles.map((c) => `${c.time},${c.open},${c.high},${c.low},${c.close}`)].join('\n') + '\n';
  fs.writeFileSync(`${dir}/${sym}.csv.gz`, zlib.gzipSync(csv));
}
function m1End(sym) {
  const txt = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('latin1').trimEnd();
  return Number(txt.slice(txt.lastIndexOf('\n') + 1).split(',')[0]);
}

async function main() {
  console.log(`Semaine ${day(week.from)} -> ${day(week.to)} (UTC), bot ${BOT_URL}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-'));
  const fetchedAt = Date.now();
  // 1. Bougies M15 du bot, accumulées ; la bougie en formation est écartée.
  for (const sym of SYMBOLS) {
    const { candles } = await getJson(`${BOT_URL}/api/candles?symbol=${sym}&limit=5000`);
    const done = candles.filter((c) => c.time + M15 <= fetchedAt).map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
    const merged = mergeCandles(readStore(sym), done);
    writeStore(sym, merged);
    const end = m1End(sym);
    if (!merged.length || merged[0].time > end + M15) throw new Error(`${sym} : trou entre la fin du M1 commité (${new Date(end).toISOString()}) et les M15 accumulées (début ${merged[0] ? new Date(merged[0].time).toISOString() : 'aucune'}) - le rejeu serait faux`);
    const last = merged[merged.length - 1].time;
    if (last + M15 < Math.min(week.to, fetchedAt) - 3 * DAY) console.warn(`  attention : dernières M15 de ${sym} au ${new Date(last).toISOString()}`);
    fs.writeFileSync(path.join(tmp, `live-${sym}.json`), JSON.stringify({ candles: merged }));
    console.log(`  ${sym} : ${merged.length} bougies M15 (${new Date(merged[0].time).toISOString().slice(0, 16)} -> ${new Date(last).toISOString().slice(0, 16)})`);
  }
  // 1b. Barres M1 sur lesquelles A/B ont décidé en live (GET /api/momentum-bars, ~40 séances), accumulées dans data/live-m1-ab/<X>.csv.gz.
  for (const sym of SYMBOLS) {
    let bars = [];
    try { bars = (await getJson(`${BOT_URL}/api/momentum-bars?symbol=${sym}`)).bars || []; } catch (err) { console.warn(`  ${sym} : barres M1 de A/B indisponibles (${err.message})`); }
    const merged = mergeCandles(readStore(sym, 'data/live-m1-ab'), bars.filter((b) => b.time + 60000 <= fetchedAt));
    if (merged.length) writeStore(sym, merged, 'data/live-m1-ab');
    fs.writeFileSync(path.join(tmp, `live-m1-${sym}.json`), JSON.stringify({ bars: merged }));
    console.log(`  ${sym} : ${merged.length} barres M1 de A/B${merged.length ? ` (${new Date(merged[0].time).toISOString().slice(0, 16)} -> ${new Date(merged[merged.length - 1].time).toISOString().slice(0, 16)})` : ' (endpoint pas encore en ligne : A/B non rejoués après le 21/09)'}`);
  }
  // 2. Rejeu fidèle depuis le début de la semaine (préchauffage de 90 jours avant, comme le live), A/B compris, avec les jambes que le filet
  // de sécurité du bot a arrêtées (GET /api/kill-switch ; absent avant son déploiement -> aucune).
  let stopped = [];
  try { const ks = await getJson(`${BOT_URL}/api/kill-switch`); stopped = Object.entries(ks.legs || {}).filter(([, l]) => !l.allowed).map(([k]) => k); } catch { /* filet de sécurité pas encore en ligne */ }
  if (stopped.length) console.log(`  jambes arrêtées par le filet de sécurité : ${stopped.join(', ')}`);
  const out = path.join(tmp, 'replay.json');
  const run = spawnSync(process.execPath, ['--max-old-space-size=4096', 'scripts/runLiveReplay.js', 'broker', '0.3'], {
    env: { ...process.env, LIVE_M15_DIR: tmp, FROM_DATE: new Date(week.from).toISOString(), REPLAY_OUT: out, STOPPED_LEGS: stopped.join(','), LIVE_M1_DIR: tmp }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`rejeu en échec :\n${run.stderr || run.stdout}`);
  const replay = JSON.parse(fs.readFileSync(out, 'utf8')).trades.map((t) => ({ ...t, entryTime: t.entryTime + OFF, exitTime: t.exitTime + OFF }))
    .filter((t) => t.entryTime >= week.from && t.entryTime < week.to);
  // 3. Trades réels de la semaine.
  const days = Math.ceil((fetchedAt - week.from) / DAY) + 1;
  const { trades } = await getJson(`${BOT_URL}/api/trade-history?days=${days}`);
  const live = trades.filter((t) => t.entryTime >= week.from && t.entryTime < week.to);
  // 4. Rapprochement et rapport.
  const rows = matchLiveAndReplay(live, replay, { replayedSymbols: SYMBOLS });
  // Explications ajoutées après enquête (data/live-check/notes.json, clé « paire|stratégie|AAAA-MM-JJTHH:MM » en UTC de l'entrée) : relues à
  // chaque passage, pour qu'une relance du script ne les efface jamais.
  const notesFile = 'data/live-check/notes.json';
  const notes = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : {};
  for (const r of rows) { const k = `${r.symbol}|${r.source}|${new Date(r.liveEntry ?? r.replayEntry).toISOString().slice(0, 16)}`; if (notes[k]) r.note = [r.note, notes[k]].filter(Boolean).join(' ; '); }
  const s = summarizeCheck(rows);
  const histFile = 'data/live-check/history.json';
  fs.mkdirSync('data/live-check', { recursive: true });
  const history = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, 'utf8')) : {};
  history[day(week.from)] = { to: day(week.to), ...s, liveR: +s.liveR.toFixed(2), replayR: +s.replayR.toFixed(2), checkedAt: new Date(fetchedAt).toISOString() };
  fs.writeFileSync(histFile, JSON.stringify(history, null, 2) + '\n');
  const weeks = Object.entries(history).sort();
  const cum = weeks.reduce((a, [, w]) => ({ identical: a.identical + w.identical, liveOnly: a.liveOnly + w.liveOnly, replayOnly: a.replayOnly + w.replayOnly, liveR: a.liveR + w.liveR, replayR: a.replayR + w.replayR }), { identical: 0, liveOnly: 0, replayOnly: 0, liveR: 0, replayR: 0 });
  const md = [
    `# Réel contre rejeu fidèle — semaine du ${day(week.from)} au ${day(week.to)}`, '',
    `Généré par \`scripts/runWeeklyLiveCheck.js\` le ${new Date(fetchedAt).toISOString().slice(0, 16)} UTC. Rejeu = \`runLiveReplay.js\` (config live, 0,3 %) sur les bougies du courtier (M1 commité puis M15 du bot). Heures de New York.`, '',
    '## Cette semaine', '',
    `- **Identiques** (même paire, stratégie, sens, entrée à moins de 20 min) : ${s.identical}`,
    `- **Seulement en réel** : ${s.liveOnly} · **seulement au rejeu** : ${s.replayOnly} · hors rejeu (GER40, EURUSD, manuels) : ${s.outOfScope}`,
    `- **R sur le périmètre commun** : réel ${sgn(s.liveR)} R, rejeu ${sgn(s.replayR)} R${s.liveRMissing ? ` (${s.liveRMissing} trade(s) réel(s) sans R connu)` : ''}`, '',
    '| Entrée (NY) | Paire | Stratégie | Sens | R réel | R rejeu | Statut | Note |', '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${ny(r.liveEntry ?? r.replayEntry)}${r.liveEntry && r.replayEntry && Math.abs(r.liveEntry - r.replayEntry) > 60000 ? ` (rejeu ${ny(r.replayEntry).slice(-5)})` : ''} | ${r.symbol} | ${r.source ?? '—'} | ${r.direction === 'bullish' ? 'achat' : 'vente'} | ${sgn(r.liveR)} | ${sgn(r.replayR)} | ${r.status} | ${r.note} |`),
    '', '## Cumul depuis le début du suivi', '',
    '| Semaine | Identiques | Réel seul | Rejeu seul | R réel | R rejeu |', '|---|---|---|---|---|---|',
    ...weeks.map(([k, w]) => `| ${k} | ${w.identical} | ${w.liveOnly} | ${w.replayOnly} | ${sgn(w.liveR)} | ${sgn(w.replayR)} |`),
    `| **Total** | **${cum.identical}** | **${cum.liveOnly}** | **${cum.replayOnly}** | **${sgn(cum.liveR)}** | **${sgn(cum.replayR)}** |`,
    '', '## Limites', '',
    '- Au-delà du M1 commité (fin 2026-09-21), les sorties du rejeu sont lues sur des bougies M15 : si le stop et l\'objectif sont dans la même bougie, le rejeu prend le stop. Les R peuvent donc différer légèrement d\'un trade identique.',
    '- Spread par défaut au rejeu ; le réel paie le vrai spread et le glissement.',
    '- GER40 et EURUSD ne sont pas dans le rejeu. A et B y sont, avec les mêmes règles d\'entrée que le bot ; leurs décisions y sont prises sur les vraies M1 : celles du courtier jusqu\'au 2026-09-21, puis celles que le bot a lui-même construites pour A/B (GET /api/momentum-bars, accumulées dans data/live-m1-ab/). Sans ces barres, A/B ne sont pas rejoués (« réel seulement »).',
    '- Le rejeu repart de zéro au début de la semaine (garde-fou, positions) ; une position ouverte en réel avant le dimanche peut expliquer un écart en début de semaine.',
  ];
  fs.writeFileSync(`data/live-check/week-${day(week.from)}.md`, md.join('\n') + '\n');
  console.log(md.slice(4, 8).join('\n'));
  console.log(`\nRapport : data/live-check/week-${day(week.from)}.md`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
main().catch((err) => { console.error(err.message); process.exit(1); });
