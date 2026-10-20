// comboAQ_juge_llm.mjs - juge LLM : extraction des paquets de contexte, appels au modèle, analyse.
// Règles et critères FIGÉS : docs/PREREG-F2-JUGE-LLM.md et docs/PROMPT-JUGE-F2.txt (écrits avant tout calcul). Le script refuse de tourner si l'un des deux a été modifié.
// Usage (depuis scripts/comboFvgV6) :
//   node --max-old-space-size=6144 comboAQ_juge_llm.mjs extract <dossier data> <dossier de sortie>
//   node comboAQ_juge_llm.mjs verify  <dossier data> <dossier de sortie>
//   node comboAQ_juge_llm.mjs judge   <paquets.jsonl> <réponses.jsonl> [--dry]        (clé dans ANTHROPIC_API_KEY ; --dry = essai à blanc sans appel)
//   node comboAQ_juge_llm.mjs analyze <dossier de sortie> [--dry]
//
// PRÉCISIONS D'IMPLÉMENTATION (écrites avant tout appel au modèle, ne changent aucun critère du pré-enregistrement) :
//  - Fenêtre = bougie de pose dont l'heure UTC est >= 2026-07-01 00:00 ; US100, GER40 et XAUUSD ; jusqu'à la dernière bougie disponible.
//  - Ordre rempli mais non clôturé avant la fin des données : sans étiquette (écarté de l'évaluation, jugé quand même).
//  - Contrôle de mémoire : 600 candidats tirés (mulberry32, graine 12345, mélange de Fisher-Yates) parmi tous les candidats 2023-2025 des trois marchés.
//  - Permutation : 10 000 tirages (mulberry32, graine 12345) parmi les setups étiquetés ; p = (1 + nb de tirages >= observé) / (1 + 10 000).
//  - t = moyenne / (écart-type échantillon / racine de n). Écart « take » moins « skip » = différence des R moyens sur les setups étiquetés.
//  - Vérification des paquets : 50 setups tirés (graine 12345), bloc de bougies recalculé par un code indépendant (ATR recalculé à part).
//  - Prix du modèle pour le plafond : 2 $ / million de tokens en entrée, 10 $ / million en sortie (page des tarifs, 2026-10-20) ; plafond 10 $.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from './comboF.mjs';
import { h4Sweeps } from './lib/krysBacktest.js';
import { backtest as backtestML } from './lib/krysBacktestML.js';
import { nyHour } from './lib/krysMethod.js';
import { loadInstrument, sha256Text } from './comboAN_autres_instruments.mjs';
import { yearCtx, baseOpts, atrSeries, features, labelSim, MIN_HIST } from './comboAP_ml_tous_fvg.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PREREG_FILE = path.join(HERE, '../../docs/PREREG-F2-JUGE-LLM.md');
export const PROMPT_FILE = path.join(HERE, '../../docs/PROMPT-JUGE-F2.txt');
export const PREREG_SHA256 = 'ce159ae2e8c0bc2548632ecc5a33c2c3a1e3772bea5724e6a4e781ac302bbe36';
export const PROMPT_SHA256 = 'bee60c72b7ae8354d10b064e557d7c0d722049d89dd76b9fa5cfc1606880ca0e';
export const MODEL = 'claude-sonnet-5-5';
export const SEED = 12345, N_PERM = 10000, N_CONTROL = 600, N_VERIFY = 50;
export const WINDOW_START = Date.UTC(2026, 6, 1);
export const PRICE_IN = 2, PRICE_OUT = 10, CAP_USD = 10; // dollars par million de tokens, plafond en dollars
const INSTRUMENTS = ['US100', 'GER40', 'XAUUSD'];

// ---------- utilitaires ----------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tstat = (a) => (a.length > 1 && sd(a) > 0 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : 0);
function permP(pool, k, obs, seed = SEED, n = N_PERM) {
  const rnd = mulberry32(seed), idx = pool.map((_, i) => i); let ge = 0;
  for (let it = 0; it < n; it++) { let s = 0; for (let j = 0; j < k; j++) { const r = j + Math.floor(rnd() * (idx.length - j)); [idx[j], idx[r]] = [idx[r], idx[j]]; s += pool[idx[j]]; } if (s / k >= obs) ge++; }
  return (1 + ge) / (1 + n);
}
const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const writeJsonl = (f, rows) => fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

function checkFrozen() {
  for (const [f, want, name] of [[PREREG_FILE, PREREG_SHA256, 'pré-enregistrement'], [PROMPT_FILE, PROMPT_SHA256, 'prompt']]) {
    if (!fs.existsSync(f)) { console.error(`${name} introuvable : ${f}. Aucun calcul sans lui.`); process.exit(1); }
    const h = sha256Text(fs.readFileSync(f, 'utf8'));
    if (h !== want) { console.error(`Le ${name} a été modifié (SHA-256 ${h}, attendu ${want}). Aucun calcul.`); process.exit(1); }
  }
  return { prereg: PREREG_SHA256, prompt: PROMPT_SHA256 };
}

function loadPromptParts() {
  const txt = fs.readFileSync(PROMPT_FILE, 'utf8').replace(/\r\n/g, '\n'), iS = txt.indexOf('[SYSTEM]'), iU = txt.indexOf('[USER]');
  return { system: txt.slice(iS + 8, iU).trim(), userTpl: txt.slice(iU + 6).trim() };
}

// ---------- paquet de contexte ----------
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2).replace(/^-0\.00$/, '0.00');
export function candleBlock(c, m, entry, A) {
  const L = []; for (let q = m - 95; q <= m; q++) L.push([c[q].o, c[q].h, c[q].l, c[q].c].map((v) => f2((v - entry) / A)).join(','));
  return L.join('\n');
}
function fill(tpl, v) { return tpl.replace(/\{(\w+)\}/g, (_, k) => { if (!(k in v)) throw new Error('champ manquant : ' + k); return String(v[k]); }); }
export function buildPrompt(userTpl, cx, a, f) {
  const k = cx.c[a.m], A = cx.atr[a.m], hr = nyHour(k.t), band = hr < 9 ? '06h-09h' : hr < 12 ? '09h-12h' : '12h-16h', risk = a.risk / A;
  return fill(userTpl, {
    direction: a.z.dir > 0 ? 'long' : 'short', hour_band: band, fvg_age: f.age, fvg_height_atr: f2((a.z.g.hi - a.z.g.lo) / A), risk_atr: f2(risk),
    target_dist_atr: f2(f.distObjectifATR), rr: f2(a.rr), target_fvg_atr: f2(f.hauteurCibleATR), sweep_flag: f.balayage32 ? 'yes' : 'no',
    bars_since_sweep: f.depuisBalayage, pos96: f2(f.pos96), pos480: f2(f.pos480), ret96: f2(f.ret96ATR), ret480: f2(f.ret480ATR), atr_rel: f2(f.atrRel),
    candles: candleBlock(cx.c, a.m, a.entry, A),
  });
}
const LEAK = /US100|GER40|XAUUSD|NAS|DAX|GOLD|20[12]\d|\b(mon|tue|wed|thu|fri)\b/i;

/** Tous les candidats d'une année civile, avec paquet et étiquette. onlyFrom : n'en garde que ceux dont la bougie de pose est >= ce temps (ms UTC). */
function packetsYear(inst, all, Y, userTpl, from = 0, to = Infinity) {
  const cx = yearCtx(all, Y); if (!cx) return [];
  cx.atr = atrSeries(cx.c); cx.sw = h4Sweeps(cx.c, 6);
  const raw = [];
  backtestML(cx.c, { ...baseOpts(cx), noFill: true, buyOnly: false, filter: (a) => { if (a.m >= MIN_HIST && cx.c[a.m].raw >= from && cx.c[a.m].raw < to) raw.push({ a, f: features(cx, a) }); return true; } });
  const spread = RULES.spread * cx.k, out = [];
  for (const { a, f } of raw) {
    const cd = { m: a.m, z: a.z, dir: a.z.dir, entry: a.entry, stop: a.stop, tp: a.tp, risk: a.risk }, L = labelSim(all, cd, spread), prompt = buildPrompt(userTpl, cx, a, f);
    if (LEAK.test(prompt)) throw new Error('fuite possible dans le paquet : ' + (prompt.match(LEAK) || [])[0]);
    out.push({ id: `${inst}|${Y}|${a.m}|${a.z.created}|${a.z.dir}`, inst, Y, m: a.m, dir: a.z.dir, sweep: f.balayage32, rawMs: cx.c[a.m].raw, filled: L.filled, r: L.r, prompt });
  }
  return out;
}

function cmdExtract(D, OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  const { userTpl } = loadPromptParts(), win = [], ctlPool = []; let lastRaw = {};
  for (const inst of INSTRUMENTS) {
    const all = loadInstrument(D, inst); lastRaw[inst] = new Date(all[all.length - 1].raw).toISOString();
    win.push(...packetsYear(inst, all, 2026, userTpl, WINDOW_START));
    for (const Y of [2023, 2024, 2025]) ctlPool.push(...packetsYear(inst, all, Y, userTpl));
  }
  // tirage du contrôle de mémoire : Fisher-Yates, graine 12345
  const rnd = mulberry32(SEED), idx = ctlPool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const ctl = idx.slice(0, N_CONTROL).sort((a, b) => a - b).map((i) => ctlPool[i]);
  writeJsonl(`${OUT}/paquets_fenetre.jsonl`, win); writeJsonl(`${OUT}/paquets_controle.jsonl`, ctl);
  const est = (rows) => { const ch = rows.reduce((s, r) => s + r.prompt.length, 0) + rows.length * 1200; return ch / 3.3; };
  const tokIn = est(win) + est(ctl), cost = tokIn / 1e6 * PRICE_IN + (win.length + ctl.length) * 30 / 1e6 * PRICE_OUT;
  const meta = { frozen: checkFrozen(), lastBar: lastRaw, window: { n: win.length, filled: win.filter((x) => x.filled).length, byInst: Object.fromEntries(INSTRUMENTS.map((i) => [i, win.filter((x) => x.inst === i).length])) }, control: { pool: ctlPool.length, n: ctl.length, filled: ctl.filter((x) => x.filled).length }, estTokensIn: Math.round(tokIn), estCostUSD: +cost.toFixed(2) };
  fs.writeFileSync(`${OUT}/extraction.meta.json`, JSON.stringify(meta, null, 1)); console.log(JSON.stringify(meta, null, 1));
}

/** Recalcule le bloc de bougies de 50 setups par un code indépendant (ATR refait à part) et le compare au paquet écrit. */
function cmdVerify(D, OUT) {
  const rows = readJsonl(`${OUT}/paquets_fenetre.jsonl`), rnd = mulberry32(SEED), pick = [];
  const idx = rows.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (const i of idx.slice(0, N_VERIFY)) pick.push(rows[i]);
  const cache = {}; let ok = 0, bad = [];
  for (const r of pick) {
    const all = cache[r.inst] || (cache[r.inst] = loadInstrument(D, r.inst)), m0 = all.findIndex((x) => x.raw === r.rawMs);
    // entrée = niveau du prompt n'est pas stocké : on la retrouve via la bougie de pose et la ligne de la dernière bougie (close - entry)/A
    const lines = r.prompt.split('\n'), cand = lines.slice(lines.length - 96).map((l) => l.split(',').map(Number));
    let atr = 0; for (let q = m0 - 13; q <= m0; q++) atr += Math.max(all[q].h - all[q].l, Math.abs(all[q].h - all[q - 1].c), Math.abs(all[q].l - all[q - 1].c)); atr /= 14;
    const last = cand[95], entry = all[m0].c - last[3] * atr; // (c - entry)/A = last[3]
    let same = true;
    for (let q = 0; q < 96 && same; q++) { const b = all[m0 - 95 + q], e = [b.o, b.h, b.l, b.c].map((v) => (v - entry) / atr); for (let j = 0; j < 4; j++) if (Math.abs(e[j] - cand[q][j]) > 0.0151) same = false; }
    if (same) ok++; else bad.push(r.id);
  }
  const res = { checked: pick.length, ok, bad, pass: ok === pick.length };
  fs.writeFileSync(`${OUT}/verification.json`, JSON.stringify(res, null, 1)); console.log('VÉRIFICATION DES PAQUETS :', JSON.stringify(res));
  if (!res.pass) process.exit(1);
}

// ---------- appels au modèle ----------
function parseAnswer(txt) {
  try { const m = txt.match(/\{[^{}]*\}/); if (!m) return null; const o = JSON.parse(m[0]); if ((o.decision !== 'take' && o.decision !== 'skip') || !Number.isInteger(o.confidence) || o.confidence < 0 || o.confidence > 100) return null; return o; } catch { return null; }
}
async function callModel(key, system, user) {
  for (let att = 0; att < 6; att++) {
    const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    if (process.env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID; // transport seulement : certaines clés exigent l'identifiant de l'espace de travail
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify({ model: MODEL, max_tokens: 60, temperature: 0, system, messages: [{ role: 'user', content: user }] }) });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * 2 ** att)); continue; }
    const j = await res.json();
    if (!res.ok) { console.error('Erreur API non récupérable (aucun paramètre n\'est modifié pour contourner) :', res.status, JSON.stringify(j.error || j)); process.exit(1); }
    return j;
  }
  console.error('Trop d\'erreurs temporaires, arrêt propre.'); process.exit(1);
}
async function cmdJudge(PKT, OUTF, dry) {
  if (dry !== /DRY/.test(path.basename(OUTF))) { console.error('Le nom du fichier de sortie doit contenir DRY si et seulement si --dry est utilisé.'); process.exit(1); }
  const { system, userTpl } = loadPromptParts(), rows = readJsonl(PKT), done = new Set(fs.existsSync(OUTF) ? readJsonl(OUTF).map((r) => r.id) : []);
  const key = process.env.ANTHROPIC_API_KEY; if (!dry && !key) { console.error('ANTHROPIC_API_KEY absente de l\'environnement. Rien n\'est appelé.'); process.exit(1); }
  const prior = fs.existsSync(OUTF) ? readJsonl(OUTF) : []; let cost = prior.reduce((s, r) => s + (r.costUSD || 0), 0);
  const todo = rows.filter((r) => !done.has(r.id)), rnd = mulberry32(SEED); let i = 0, stopped = false;
  console.log(`${dry ? 'ESSAI À BLANC' : 'JUGE'} | ${rows.length} paquets, ${done.size} déjà faits, ${todo.length} à faire | dépense déjà comptée : ${cost.toFixed(3)} $`);
  const worker = async () => {
    while (!stopped) {
      const r = todo[i++]; if (!r) return;
      let rec;
      if (dry) { const take = rnd() < 0.3; rec = { id: r.id, decision: take ? 'take' : 'skip', confidence: Math.floor(rnd() * 101), invalid: false, model: 'DRY', tokIn: 0, tokOut: 0, costUSD: 0 }; }
      else {
        if (cost + 0.01 > CAP_USD) { stopped = true; console.error(`Plafond de ${CAP_USD} $ atteint : arrêt propre. L'étude est INTERROMPUE.`); return; }
        let ans = null, j, tin = 0, tout = 0, raw = '';
        for (let t = 0; t < 2 && !ans; t++) { j = await callModel(key, system, r.prompt); tin += j.usage?.input_tokens || 0; tout += j.usage?.output_tokens || 0; raw = (j.content || []).map((b) => b.text || '').join(''); ans = parseAnswer(raw); }
        const c = tin / 1e6 * PRICE_IN + tout / 1e6 * PRICE_OUT; cost += c;
        rec = { id: r.id, decision: ans ? ans.decision : 'skip', confidence: ans ? ans.confidence : 0, invalid: !ans, model: j.model, tokIn: tin, tokOut: tout, costUSD: c, raw };
      }
      fs.appendFileSync(OUTF, JSON.stringify(rec) + '\n');
      if ((prior.length + i) % 50 === 0) console.log(`  ${prior.length + i} / ${rows.length} | ${cost.toFixed(3)} $`);
    }
  };
  await Promise.all(Array.from({ length: dry ? 1 : 4 }, worker));
  console.log(`terminé | dépense totale comptée : ${cost.toFixed(3)} $ -> ${OUTF}`);
}

// ---------- analyse ----------
function evalSet(pk, rs) {
  const resp = new Map(rs.map((r) => [r.id, r])), j = pk.map((p) => ({ ...p, ...resp.get(p.id) })).filter((x) => x.decision);
  const lab = j.filter((x) => x.filled === 1), take = lab.filter((x) => x.decision === 'take'), skip = lab.filter((x) => x.decision === 'skip');
  const rt = take.map((x) => x.r), rsk = skip.map((x) => x.r), pool = lab.map((x) => x.r);
  const o = { judged: j.length, labelled: lab.length, takeAll: j.filter((x) => x.decision === 'take').length, takeLab: take.length, skipLab: skip.length, invalid: j.filter((x) => x.invalid).length };
  if (take.length > 1) { o.meanTake = mean(rt); o.tTake = tstat(rt); o.meanSkip = skip.length ? mean(rsk) : null; o.diff = skip.length ? o.meanTake - o.meanSkip : null; o.meanAll = mean(pool); o.p = permP(pool, take.length, o.meanTake); }
  return { o, j, lab, take };
}
function cmdAnalyze(OUT, dry) {
  const pre = dry ? 'DRY-' : '', fr = `${OUT}/${pre}reponses_fenetre.jsonl`, cr = `${OUT}/${pre}reponses_controle.jsonl`;
  const W = evalSet(readJsonl(`${OUT}/paquets_fenetre.jsonl`), readJsonl(fr)), C = fs.existsSync(cr) ? evalSet(readJsonl(`${OUT}/paquets_controle.jsonl`), readJsonl(cr)) : null;
  const o = W.o, ver = fs.existsSync(`${OUT}/verification.json`) ? JSON.parse(fs.readFileSync(`${OUT}/verification.json`)).pass : false;
  const invalidRate = o.judged ? o.invalid / o.judged : 1;
  const crit = {
    c1_effectif: o.judged >= 300 && o.takeLab >= 100,
    c2_moyenne_et_t: o.meanTake > 0 && o.tTake >= 1.96,
    c3_ecart_vs_skip: o.diff !== null && o.diff >= 0.10,
    c4_permutation: o.p <= 0.05,
    c5_controles: ver && invalidRate < 0.02,
  };
  let verdict;
  if (!crit.c1_effectif) verdict = 'NON CONCLUANT';
  else if (Object.values(crit).every(Boolean)) verdict = 'JUGE UTILE';
  else if (o.meanTake > 0 && o.tTake >= 1.0 && o.p <= 0.10) verdict = 'COMPATIBLE, NON PROUVÉ';
  else verdict = 'AUCUN GAIN';
  const desc = {};
  for (const inst of INSTRUMENTS) { const s = W.lab.filter((x) => x.inst === inst), t = s.filter((x) => x.decision === 'take'); desc[inst] = { labelled: s.length, take: t.length, meanTake: t.length ? mean(t.map((x) => x.r)) : null, meanAll: s.length ? mean(s.map((x) => x.r)) : null }; }
  for (const [nm, dir] of [['achats', 1], ['ventes', -1]]) { const s = W.lab.filter((x) => x.dir === dir), t = s.filter((x) => x.decision === 'take'); desc[nm] = { labelled: s.length, take: t.length, meanTake: t.length ? mean(t.map((x) => x.r)) : null, meanAll: s.length ? mean(s.map((x) => x.r)) : null }; }
  { const s = W.lab.filter((x) => x.dir === 1 && x.sweep === 1), t = s.filter((x) => x.decision === 'take'); desc.f2_like = { labelled: s.length, take: t.length, meanTake: t.length ? mean(t.map((x) => x.r)) : null, meanAll: s.length ? mean(s.map((x) => x.r)) : null }; }
  const res = { dry, verdict: dry ? 'ESSAI À BLANC, SANS VALEUR : ' + verdict : verdict, criteres: crit, fenetre: o, invalidRate, descriptif: desc, controleMemoire: C ? C.o : null };
  const outF = `${OUT}/${pre}VERDICT-JUGE.json`; fs.writeFileSync(outF, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
}

// ---------- point d'entrée ----------
if (process.argv[1] && process.argv[1].endsWith('comboAQ_juge_llm.mjs')) {
  const [cmd, a, b, c] = process.argv.slice(2), dry = process.argv.includes('--dry');
  if (!['extract', 'verify', 'judge', 'analyze'].includes(cmd) || !a) { console.error('Usage : extract <data> <sortie> | verify <data> <sortie> | judge <paquets> <réponses> [--dry] | analyze <sortie> [--dry]'); process.exit(2); }
  const h = checkFrozen(); console.log('Juge LLM | prereg', h.prereg, '| prompt', h.prompt, '| lancé', new Date().toISOString());
  if (cmd === 'extract') cmdExtract(a, b); else if (cmd === 'verify') cmdVerify(a, b); else if (cmd === 'judge') await cmdJudge(a, b, dry); else cmdAnalyze(a, dry);
}
