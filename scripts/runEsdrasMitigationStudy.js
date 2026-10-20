#!/usr/bin/env node





// scripts/runEsdrasMitigationStudy.js - Analyse 16 ans (2010-2026)
// Stratégie : Mitigation FVG Récent vers FVG Cible (FVG à gauche)

import fs from 'node:fs';
import { PHASES, loadPhase, spreadAt, stats, sgn, nyMin } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';

const SYM = process.argv[2] || 'US100';

async function runForPhase(phase) {
  let S;
  try { S = loadPhase(SYM, phase); } catch (e) { return []; }
  const X = buildContext(S);
  const { b15 } = X;
  const fvg15 = X.fvg[0]; // FVGs M15 déjà calculés par le moteur du bot
  
  const trades = [];
  const spread = spreadAt(SYM, S.c[0]);
  
  // On trie les FVGs par ordre chronologique de bougie C (z.k)
  const fvgs = fvg15.sort((a, b) => a.k - b.k);

  for (let i = 0; i < fvgs.length - 1; i++) {
    const z = fvgs[i];
    if (z.k < 100) continue;
    
    // 1. Déclenchement de la Mitigation : le prix doit entrer dans la zone z après sa formation
    // La bougie C du FVG est z.k. On regarde les bougies suivantes.
    const entryTime = S.t[b15[z.k + 1].i0];
    const nm = nyMin(entryTime);
    // On reste dans les sessions liquides (NY / Londres) pour éviter le bruit de nuit
    if (!((nm >= 480 && nm <= 1020) || (nm >= 1200 && nm <= 1380))) continue;

    let fillIdx = -1;
    for (let j = z.k + 1; j < z.k + 40; j++) { // On cherche une mitigation dans les 10h
        if (j >= b15.length) break;
        const b = b15[j];
        if (z.dir > 0 ? b.l <= z.top : b.h >= z.bot) {
            // Touche la zone
            if (z.dir > 0 ? b.c < z.bot : b.c > z.top) break; // Invalidation (clôture au-delà)
            fillIdx = j;
            break;
        }
    }

    if (fillIdx === -1) continue;

    // 2. Chercher le FVG Cible ("FVG à gauche")
    let targetPrice = null;
    // On cherche un FVG opposé non comblé situé devant nous
    for (let j = i - 1; j >= 0; j--) {
        const prev = fvgs[j];
        if (prev.dir === -z.dir && prev.touch > fillIdx) { // non comblé jusqu'à maintenant
            targetPrice = z.dir > 0 ? prev.bot : prev.top;
            break;
        }
    }

    if (!targetPrice) continue;

    // 3. Paramètres du trade
    const entry = z.dir > 0 ? z.top : z.bot;
    const stop = z.dir > 0 ? z.bot - 2 : z.top + 2; 
    const risk = Math.abs(entry - stop);
    
    // NOUVEAU : On limite le TP à 3R si le FVG cible est trop loin, ou au FVG cible s'il est plus proche
    const maxRR = 3.0;
    const theoreticalTarget = targetPrice;
    const fixedTarget = entry + z.dir * maxRR * risk;
    
    // On prend le plus proche des deux objectifs (sécurité)
    const finalTarget = z.dir > 0 ? Math.min(theoreticalTarget, fixedTarget) : Math.max(theoreticalTarget, fixedTarget);

    if (risk <= 0 || Math.abs(finalTarget - entry) / risk < 2.0) continue;

    // 4. Simulation avec Trailing Stop (BE dès 1.5R)
    let res = null;
    let beActive = false;
    let currentStop = stop;

    for (let j = fillIdx + 1; j < b15.length; j++) {
        const b = b15[j];
        
        // Break-even dès qu'on atteint 1.5R
        if (!beActive && (z.dir > 0 ? b.h - entry : entry - b.l) >= 1.5 * risk) {
            beActive = true;
            currentStop = entry;
        }

        if (z.dir > 0 ? b.h >= finalTarget : b.l <= finalTarget) { res = Math.abs(finalTarget - entry) / risk; break; }
        if (z.dir > 0 ? b.l <= currentStop : b.h >= currentStop) { res = beActive ? 0 : -1; break; }
        if (nyMin(S.t[b.i1]) >= 16 * 60 + 45) { res = (z.dir > 0 ? b.c - entry : entry - b.c) / risk; break; }
    }

    if (res !== null) {
        trades.push({ t: S.t[b15[fillIdx].i0], r: res });
        i += 5; // On saute un peu pour ne pas reprendre le même mouvement
    }
  }
  return trades;
}

async function main() {
  console.log(`=== Analyse Mitigation FVG 16 ans : ${SYM} ===\n`);
  let allTrades = [];
  
  for (const phase of ['explore', 'validation', 'final']) {
    process.env.NIGHT_PHASE = phase;
    const tr = await runForPhase(phase);
    allTrades = allTrades.concat(tr);
    const s = stats(tr);
    console.log(`Phase ${phase.padEnd(10)} : ${tr.length.toString().padStart(4)} trades | ${sgn(s.mean, 2)} R moyen`);
  }

  const sGlobal = stats(allTrades);
  console.log(`\n--------------------------------------------------`);
  console.log(`TOTAL ${SYM} (2010-2026) : ${allTrades.length} trades`);
  console.log(`R moyen : ${sgn(sGlobal.mean, 3)} R`);
  console.log(`t-stat  : ${sGlobal.t.toFixed(2)}`);
  console.log(`--------------------------------------------------`);
}

main();
