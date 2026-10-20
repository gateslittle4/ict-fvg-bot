#!/usr/bin/env node
// scripts/runEsdrasSMC2026_US100.js - Exécution stricte sur le CSV 2026 US100

import fs from 'node:fs';
import { nyMin } from './lib/nightLab.js';

async function run() {
  console.log(`=== Audit SMC US100 sur l'année 2026 (Mois par Mois) ===\n`);
  
  // Chemin ajusté pour US100 en 2026
  const dataPath = 'data/forward-test-2026/US100.csv';
  if (!fs.existsSync(dataPath)) {
      console.log(`Fichier ${dataPath} non trouvé.`);
      return;
  }

  const raw = fs.readFileSync(dataPath, 'utf8').trim().split('\n');
  const lines = raw.slice(1);
  
  const S = { t: [], o: [], h: [], l: [], c: [], n: 0 };
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 5) continue;
    S.t.push(Number(parts[0]));
    S.o.push(Number(parts[1]));
    S.h.push(Number(parts[2]));
    S.l.push(Number(parts[3]));
    S.c.push(Number(parts[4]));
  }
  S.n = S.t.length;

  const trades = [];

  for (let i = 100; i < S.n - 50; i++) {
    const time = S.t[i];
    const nm = nyMin(time);
    if (nm < 8 * 60 || nm > 11 * 60 + 30) continue;

    // 1. FVG baissier haut
    let fvgTop = null;
    for (let j = i - 20; j < i - 1; j++) {
      if (S.h[j+1] < S.l[j-1] - 5) { // 5 points US100 (plus large que US500)
        fvgTop = { top: S.l[j-1], bot: S.h[j+1] };
      }
    }
    if (!fvgTop) continue;

    let touched = false;
    for (let j = i - 20; j < i; j++) if (S.h[j] >= fvgTop.bot) touched = true;
    if (!touched || S.c[i] >= fvgTop.top) continue;

    // 2. FVG cible plus bas
    let fvgLeft = null;
    for (let j = i - 100; j < i - 1; j++) {
      if (S.h[j+1] < S.l[j-1] - 5 && S.l[j-1] < fvgTop.bot) {
        fvgLeft = { top: S.l[j-1], bot: S.h[j+1] };
        break;
      }
    }
    if (!fvgLeft) continue;

    // 3. Sweep
    let sessionLow = Infinity;
    for (let j = i - 16; j < i; j++) if (S.l[j] < sessionLow) sessionLow = S.l[j];

    if (S.l[i] <= sessionLow && S.c[i] > sessionLow) {
      const entry = S.c[i];
      const stop = S.l[i] - 15.0; // 15 points US100
      const target = fvgLeft.top;
      const risk = entry - stop;

      if (risk <= 0 || (target - entry) / risk < 2.5) continue;

      let outcome = null;
      for (let j = i + 1; j < S.n; j++) {
        if (S.h[j] >= target) { outcome = (target - entry) / risk; break; }
        if (S.l[j] <= stop) { outcome = -1.0; break; }
        if (nyMin(S.t[j]) >= 16 * 60 + 45) { outcome = (S.c[j] - entry) / risk; break; }
      }
      if (outcome !== null) {
        trades.push({ t: time, r: outcome });
        i += 16; 
      }
    }
  }

  const byMonth = {};
  trades.forEach(t => {
    const d = new Date(t.t);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(t.r);
  });

  console.log(`Résultats par mois en 2026 :`);
  Object.keys(byMonth).sort().forEach(m => {
    const rs = byMonth[m];
    const sum = rs.reduce((a, b) => a + b, 0);
    console.log(`- ${m} : ${rs.length} trade(s) | Total: ${sum.toFixed(1)} R`);
  });
  console.log(`\nTOTAL 2026 : ${trades.length} trades | Total: ${trades.reduce((a, b) => a + b.r, 0).toFixed(1)} R`);
}
run();
