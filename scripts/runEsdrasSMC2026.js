#!/usr/bin/env node
// scripts/runEsdrasSMC2026.js - Exécution stricte sur le CSV 2026 US500

import fs from 'node:fs';
import { nyMin } from './lib/nightLab.js';

async function run() {
  console.log(`=== Audit SMC US500 sur l'année 2026 (Mois par Mois) ===\n`);
  
  const raw = fs.readFileSync('data/forward-test-2026/US500.csv', 'utf8').trim().split('\n');
  const lines = raw.slice(1); // skip header
  
  const S = {
    t: [], o: [], h: [], l: [], c: [], n: 0
  };

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
  const spread = 0.5;

  for (let i = 100; i < S.n - 50; i++) {
    const time = S.t[i];
    const nm = nyMin(time);
    
    // Fenêtre 08:00 - 11:30 NY
    if (nm < 8 * 60 || nm > 11 * 60 + 30) continue;

    // 1. Chercher un FVG baissier supérieur dans les 20 bougies d'avant
    let fvgTop = null;
    for (let j = i - 20; j < i - 1; j++) {
      if (S.h[j+1] < S.l[j-1] - 0.5) {
        fvgTop = { top: S.l[j-1], bot: S.h[j+1] };
      }
    }
    if (!fvgTop) continue;

    // Retest du FVG supérieur
    let touched = false;
    for (let j = i - 20; j < i; j++) {
      if (S.h[j] >= fvgTop.bot) touched = true;
    }
    if (!touched || S.c[i] >= fvgTop.top) continue;

    // 2. Chercher FVG cible plus bas
    let fvgLeft = null;
    for (let j = i - 100; j < i - 1; j++) {
      if (S.h[j+1] < S.l[j-1] - 0.5 && S.l[j-1] < fvgTop.bot) {
        fvgLeft = { top: S.l[j-1], bot: S.h[j+1] };
        break;
      }
    }
    if (!fvgLeft) continue;

    // 3. Balayage du plus bas de la matinée (4h d'historique)
    let sessionLow = Infinity;
    for (let j = i - 16; j < i; j++) {
      if (S.l[j] < sessionLow) sessionLow = S.l[j];
    }

    // Si la bougie actuelle passe sous le plus bas et réintègre (clôture au-dessus)
    if (S.l[i] <= sessionLow && S.c[i] > sessionLow) {
      const entry = S.c[i];
      const stop = S.l[i] - 3.0;
      const target = fvgLeft.top;
      const risk = entry - stop;

      if (risk <= 0 || (target - entry) / risk < 2.5) continue;

      // Simulation du trade
      let outcome = null;
      for (let j = i + 1; j < S.n; j++) {
        // TP touché en premier ?
        if (S.h[j] >= target) {
          outcome = (target - entry) / risk;
          break;
        }
        // SL touché ?
        if (S.l[j] <= stop) {
          outcome = -1.0;
          break;
        }
        // Clôture en fin de séance à 16:45 NY
        if (nyMin(S.t[j]) >= 16 * 60 + 45) {
          outcome = (S.c[j] - entry) / risk;
          break;
        }
      }

      if (outcome !== null) {
        trades.push({ t: time, r: outcome });
        i += 16; // Pause de 4h pour éviter de sur-trader le même signal
      }
    }
  }

  // Regroupement par mois
  const byMonth = {};
  trades.forEach(t => {
    const d = new Date(t.t);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(t.r);
  });

  console.log(`Résultats par mois en 2026 :`);
  let totalTrades = 0;
  let totalR = 0;

  Object.keys(byMonth).sort().forEach(m => {
    const rs = byMonth[m];
    const wins = rs.filter(r => r > 0).length;
    const wr = ((wins / rs.length) * 100).toFixed(1);
    const sum = rs.reduce((a, b) => a + b, 0);
    const avg = sum / rs.length;
    totalTrades += rs.length;
    totalR += sum;
    console.log(`- ${m} : ${rs.length} trade(s) | WR: ${wr}% | R moyen: ${avg.toFixed(2)} R | Total: ${sum.toFixed(1)} R`);
  });

  console.log(`\n--------------------------------------------------`);
  console.log(`TOTAL 2026 : ${totalTrades} trades | Total: ${totalR.toFixed(1)} R`);
  console.log(`--------------------------------------------------`);
}

run();
