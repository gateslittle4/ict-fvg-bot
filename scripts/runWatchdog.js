#!/usr/bin/env node
// runWatchdog.js — the thin runner behind .github/workflows/watchdog.yml.
// Deliberately thin: every decision lives in src/watchdogDecision.js, which is
// pure and tested. This file only does the three things that cannot be tested
// without the network - fetch, read/write the state file, push to ntfy.
//
// Runs on GitHub Actions, NOT on Render: a watchdog inside the process it
// watches cannot report the process dying. See healthReport.js's header.

import { readFileSync, writeFileSync } from 'node:fs';
import { decideWatchdogAlert, decideNotification, OK } from '../src/watchdogDecision.js';

const HEALTH_URL = process.env.HEALTH_URL || 'https://ict-fvg-bot.onrender.com/healthz';
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';
const STATE_FILE = process.env.WATCHDOG_STATE_FILE || '.watchdog-state';
// Render's free tier can take tens of seconds to answer a cold start. Waiting
// is right: a slow answer is a living bot, and calling it dead would be a
// false alarm at the worst possible moment.
const TIMEOUT_MS = Number(process.env.WATCHDOG_TIMEOUT_MS) || 60_000;

async function readHealth() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { health: null, fetchError: `HTTP ${res.status}` };
    return { health: await res.json(), fetchError: null };
  } catch (err) {
    return { health: null, fetchError: err.name === 'TimeoutError' ? 'aucune réponse' : err.message };
  }
}

function readPreviousState() {
  try {
    return readFileSync(STATE_FILE, 'utf8').trim() || null;
  } catch {
    return null; // first run, or the cache was evicted - treat as "nothing known yet"
  }
}

async function push(title, body) {
  if (!NTFY_TOPIC) {
    console.error('NTFY_TOPIC absent - alerte NON envoyée. Ajoute-la dans les secrets GitHub du dépôt.');
    return;
  }
  const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: { Title: encodeURIComponent(title), Priority: 'high', Tags: 'warning' },
    body,
  });
  if (!res.ok) console.error(`[ntfy] échec du push: HTTP ${res.status}`);
}

// Test mode: proves the whole push chain - secret, topic, phone - without
// having to break the bot or wait for a real fault. Needed because the
// market-hours gate means a healthy weekend run is CORRECTLY silent, so
// "no alert" can mean "all fine" or "the secret is wrong", and those two
// must never be indistinguishable. Deliberately skips the health check and
// touches no state file, so a test can never mask or clear a real fault.
if (String(process.env.WATCHDOG_TEST_ALERT) === 'true') {
  console.log('mode TEST - envoi d\'une alerte de vérification, le bot n\'est pas interrogé');
  await push('Test de la surveillance', "Ceci est un test. Si tu lis ceci sur ton téléphone, les alertes du bot fonctionnent.");
  process.exit(0);
}

const { health, fetchError } = await readHealth();
const current = decideWatchdogAlert({ health, fetchError });
const previous = readPreviousState();
const notification = decideNotification(current, previous);

console.log(`état=${current.state} précédent=${previous ?? '(aucun)'} notifier=${notification.send}`);
if (health) console.log(`/healthz: ${JSON.stringify(health)}`);

if (notification.send) await push(notification.title, notification.body);

// Written even when nothing is sent - that is what makes the next run able to
// tell "still broken" from "broken again", and to send the all-clear once.
writeFileSync(STATE_FILE, current.state);

// Never fail the job on a detected fault: a red X in the Actions tab is not
// how Esdras finds out, the push is. Exiting non-zero would only add e-mail
// noise on top of an alert already delivered.
process.exit(0);
