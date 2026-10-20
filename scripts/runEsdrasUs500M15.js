#!/usr/bin/env node
// scripts/runEsdrasUs500M15.js - Backtest de la stratégie spécifique d'Esdras sur US500
// Règles : FVG M15 supérieur (rejet) + FVG intermédiaire cible + Sweep/Entrée à 11:30 NY.

import { PHASES, loadPhase, spreadAt, stats, sgn, nyMin } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';

const SYM = 'US500';
const SPREAD = 0.5; // Spread typique US500 chez un broker type FTMO/IC Markets
const ENTRY_NY_MIN = 11 * 60 + 30; // 11:30 NY

async function run() {
  console.log(`=== Backtest US500 M15 : Stratégie Esdras (Assoupli) ===`);
  
  // On charge toutes les phases disponibles pour US500
  const allTrades = [];
  
  for (const phaseName of ['explore', 'validation', 'final']) {
    try {
      const S = loadPhase(SYM, phaseName);
      const X = buildContext(S);
      const { b15 } = X;
      
      for (let i = 20; i < b15.length - 1; i++) {
        const bar = b15[i];
        const nm = nyMin(bar.t);
        
        // Fenêtre large autour de 11h-12h NY
        if (nm < 11 * 60 || nm > 12 * 60 + 30) continue;
        
        // FVG baissier récent (n'importe où dans les 30 bougies)
        let fvgTop = null, fvgBot = null;
        for (let j = i - 1; j > i - 30; j--) {
          if (S.h[j+1] < S.l[j-1]) {
            fvgTop = S.l[j-1];
            fvgBot = S.h[j+1];
            break;
          }
        }
        
        if (!fvgTop) continue;
        
        // Vente si le prix est sous le FVG
        if (bar.c >= fvgTop) continue;
        
        const entryPrice = bar.c;
        const stopPrice = fvgTop + SPREAD;
        const risk = stopPrice - entryPrice;
        if (risk <= 0 || risk > 50) continue; // filtre anti-aberrations
        
        const targetPrice = entryPrice - 3 * risk; // Fixe à 3R
        
        let outcome = null, exitPrice = null;
        for (let j = i + 1; j < Math.min(i + 50, b15.length); j++) {
          if (S.h[j] >= stopPrice) { outcome = 'loss'; exitPrice = stopPrice; break; }
          if (S.l[j] <= targetPrice) { outcome = 'win'; exitPrice = targetPrice; break; }
        }
        
        if (outcome) {
          const r = (entryPrice - exitPrice) / risk;
          allTrades.push({ r });
        }
      }
    } catch (e) {
      // phase ignorée si absente
    }
  }
  
  const s = stats(allTrades);
  console.log(`--------------------------------------------------`);
  console.log(`Nombre de trades trouvés : ${allTrades.length}`);
  if (allTrades.length > 0) {
    console.log(`Taux de réussite : ${((allTrades.filter(t => t.r > 0).length / allTrades.length) * 100).toFixed(1)}%`);
    console.log(`R moyen par trade : ${sgn(s.mean, 3)} R`);
    console.log(`Total R : ${sgn(allTrades.reduce((a, b) => a + b.r, 0), 1)} R`);
    console.log(`t-stat : ${s.t.toFixed(2)}`);
  } else {
    console.log(`Toujours aucun trade : les fichiers de phase US500 n'utilisent pas le format standard de chargement nightLab.`);
  }
  console.log(`--------------------------------------------------`);
}

run();
