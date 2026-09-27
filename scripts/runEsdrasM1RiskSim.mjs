// runEsdrasM1RiskSim.mjs - M1 (objectif 3R fixe) : compte et challenges FTMO simplifiés selon le risque par trade (descriptif), à partir de
// data/backtest-input/esdras-m1-trades-*.json (scripts/runEsdrasM1Risk.js). Usage : node scripts/runEsdrasM1RiskSim.mjs
import fs from 'node:fs';
import { eng } from '/home/user/ict-fvg-bot/scripts/lib/m1Data.js';
import { dayKey } from '/home/user/ict-fvg-bot/scripts/lib/nightLab.js';
const ld = (p) => JSON.parse(fs.readFileSync(`/home/user/ict-fvg-bot/data/backtest-input/esdras-m1-trades-${p}.json`));
const T = [...ld('explore').filter((t) => t.t >= eng(2011) && t.t < eng(2019)), ...ld('validation').filter((t) => t.t >= eng(2019) && t.t < eng(2023)), ...ld('final').filter((t) => t.t >= eng(2023))].sort((a, b) => a.x - b.x);
const year = (t) => new Date(t).getUTCFullYear();
let streak = 0, worst = 0; for (const t of T) { if (t.r < 0) { streak++; worst = Math.max(worst, streak); } else streak = 0; }
console.log(`trades ${T.length}, plus longue série de pertes ${worst}`);
for (const risk of [0.001, 0.0025, 0.005, 0.01]) {
  let eq = 1, peak = 1, dd = 0; const by = {};
  for (const t of T) { const y = year(t.x); by[y] = by[y] ?? eq; eq *= 1 + risk * t.r; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); by[y + '_end'] = eq; }
  const years = [...new Set(T.map((t) => year(t.x)))];
  const yr = years.map((y) => `${y} ${((by[y + '_end'] / by[y] - 1) * 100).toFixed(1)}%`).join(' | ');
  // challenges FTMO (phase 1 simplifiée) : +10 % = réussi ; -10 % du départ ou -5 % du départ dans une journée = échoué ; départ au 1er trade de chaque mois
  let pass = 0, fail = 0, open = 0; const days = []; const recent = { pass: 0, fail: 0, open: 0 };
  const starts = []; let lastM = null; T.forEach((t, k) => { const m = new Date(t.t).toISOString().slice(0, 7); if (m !== lastM) { starts.push(k); lastM = m; } });
  for (const s of starts) {
    let bal = 1, d0 = null, dayStart = 1, res = null;
    for (let k = s; k < T.length; k++) {
      const t = T[k], d = dayKey(t.x); if (d !== d0) { d0 = d; dayStart = bal; }
      bal += risk * t.r; // risque fixe sur le solde de départ, comme un challenge
      if (dayStart - bal >= 0.05) { res = 'fail'; break; }
      if (bal <= 0.9) { res = 'fail'; break; }
      if (bal >= 1.1) { res = 'pass'; days.push((t.x - T[s].t) / 864e5); break; }
    }
    if (res === "pass") pass++; else if (res === "fail") fail++; else open++;
    if (T[s].t >= eng(2023)) { recent[res || "open"]++; }
  }
  days.sort((a, b) => a - b);
  console.log(`\nrisque ${(risk * 100).toFixed(2)} % : total ${((eq - 1) * 100).toFixed(0)} % sur 2011-2026, pire baisse ${(dd * 100).toFixed(1)} %`);
  console.log(`  par année : ${yr}`);
  console.log(`  départs depuis 2023 : réussis ${recent.pass}, échoués ${recent.fail}, jamais finis ${recent.open}`);
  console.log(`  challenges +10 % (départ chaque mois, ${starts.length}) : réussis ${pass}, échoués ${fail}, jamais finis ${open} ; durée médiane pour réussir ${days.length ? (days[days.length >> 1] / 30).toFixed(1) + ' mois' : '-'}`);
}
