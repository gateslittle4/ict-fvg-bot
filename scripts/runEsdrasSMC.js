#!/usr/bin/env node
// scripts/runEsdrasSMC.js - Backtest de la stratégie SMC / FVG d'Esdras sur US500
// Fenêtre : 08:00 à 11:30 NY. Règles : Rejet FVG haut + Cible FVG bas + Sweep de liquidité.

import { PHASES, loadPhase, stats, sgn, nyMin } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';

const SYM = 'US500';
const SPREAD = 0.5;

async function run() {
  console.log(`=== Backtest US500 M15 : Audit Année 2026 Strict (Sans Biais) ===`);
  
  const trades = [];
  
  // On charge les données 2026 (via real-data ou forward-test si dispo)
  try {
    const S = loadPhase(SYM, 'final');
    const X = buildContext(S);
    const { b15 } = X;
    
    for (let i = 30; i < b15.length - 1; i++) {
      const bar = b15[i];
      const nm = nyMin(bar.t);
      const year = new Date(bar.t).getUTCFullYear();
      
      // On filtre strictement sur 2026
      if (year !== 2026) continue;
      if (nm < 8 * 60 || nm > 11 * 60 + 30) continue;
      
      // 1. Recherche FVG baissier supérieur (fenêtre passée uniquement)
      let fvgTop = null, fvgBot = null;
      for (let j = i - 1; j > i - 40; j--) {
        if (S.h[j+1] < S.l[j-1]) {
          fvgTop = S.l[j-1];
          fvgBot = S.h[j+1];
          break;
        }
          }
      if (!fvgTop) continue;
      
      // 2. Recherche FVG aimant en bas
      let targetFvgBot = null;
      for (let j = i - 1; j > i - 60; j--) {
        if (S.h[j+1] < S.l[j-1] && S.l[j-1] < fvgBot) {
          targetFvgBot = S.h[j+1];
          break;
        }
      }
      
      // 3. Sweep du plus bas récent
      const recentLow = Math.min(...S.l.slice(i - 6, i));
      const isSweep = bar.l < recentLow && bar.c > bar.l;
      if (!isSweep) continue;
      
      const entryPrice = bar.c;
      const stopPrice = bar.l - 3.0;
      const risk = entryPrice - stopPrice;
      if (risk <= 0 || risk > 30) continue;
      
      const targetPrice = targetFvgBot ? targetFvgBot : entryPrice + 3 * risk;
      
      // 4. Résolution séquentielle (Stop d'abord, puis TP)
      let outcome = null, exitPrice = null;
      for (let j = i + 1; j < Math.min(i + 80, b15.length); j++) {
        // En Long : on touche le stop si le Low descend sous le stop
        if (S.l[j] <= stopPrice) { outcome = 'loss'; exitPrice = stopPrice; break; }
        // En Long : on touche le TP si le High monte au-dessus du target
        if (S.h[j] >= targetPrice) { outcome = 'win'; exitPrice = targetPrice; break; }
        if (nyMin(S.t[j]) >= 16 * 60) { outcome = 'time'; exitPrice = S.c[j]; break; }
      }
      
      if (outcome) {
        const r = (exitPrice - entryPrice) / risk;
        trades.push({ r, outcome });
      }
    }
  } catch (e) {
    console.log("Erreur de chargement des données 2026 :", e.message);
  }
  
  console.log(`--------------------------------------------------`);
  if (trades.length > 0) {
    const wins = trades.filter(t => t.r > 0).length;
    const wr = (wins / trades.length) * 100;
    const totalR = trades.reduce((a, b) => a + b.r, 0);
    const meanR = totalR / trades.length;
    const s = stats(trades);
    console.log(`Année 2026 : ${trades.length} trades | WinRate: ${wr.toFixed(1)}% | R moyen: ${sgn(meanR, 2)} R | Total: ${sgn(totalR, 1)} R | t-stat: ${s.t.toFixed(2)}`);
  } else {
    console.log(`Aucun trade trouvé spécifiquement en 2026 avec les fichiers actuels.`);
  }
  console.log(`--------------------------------------------------`);
}

run();
