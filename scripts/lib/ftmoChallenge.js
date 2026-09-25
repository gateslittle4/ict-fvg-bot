// ftmoChallenge.js - challenge FTMO 1-Step rejoué sur une liste de trades en R (preregistration-weekend-close-2026-09-25.md).
// Règles : +10 % à atteindre, perte max 10 % sous le plus haut solde de fin de journée, perte du jour 3 % (depuis le solde du début
// de journée), meilleur jour <= 50 % du gain total. Soldes réalisés à la clôture de chaque trade ; jour = minuit heure de Prague
// approché par UTC + 1 h. Risque fixe en % du solde de départ (1 R = riskPct %).
const DAY = 86400000, CET = 3600000;

/**
 * @param {Array<{ u: number, x: number, r: number }>} trades - entrée / sortie en ms UTC, triés par sortie
 * @returns {{ res: 'pass'|'bust'|'bust-day'|'open', days: number }}
 */
export function challengeOutcome(trades, start, { riskPct = 0.5, end = Infinity } = {}) {
  const target = 10 / riskPct, maxLoss = 10 / riskPct, dayLoss = 3 / riskPct;
  let eq = 0, maxEod = 0, day = null, dayStart = 0;
  const byDay = new Map();
  for (const t of trades) {
    if (t.u < start) continue;
    const d = Math.floor((t.x + CET) / DAY);
    if (d !== day) { if (day !== null) maxEod = Math.max(maxEod, eq); day = d; dayStart = eq; }
    eq += t.r;
    byDay.set(d, (byDay.get(d) || 0) + t.r);
    if (dayStart - eq >= dayLoss) return { res: 'bust-day', days: (t.x - start) / DAY };
    if (eq <= maxEod - maxLoss) return { res: 'bust', days: (t.x - start) / DAY };
    if (eq >= target && Math.max(...byDay.values()) <= 0.5 * eq) return { res: 'pass', days: (t.x - start) / DAY };
  }
  return { res: 'open', days: (end - start) / DAY };
}

/** Un départ chaque lundi (00:00 UTC) de [from, to) ; ignore les départs à moins de 30 jours de `end`. */
export function weeklyStarts(from, to, end) {
  const s = [];
  let t = from + ((8 - new Date(from).getUTCDay()) % 7) * DAY;
  for (; t < to && t < end - 30 * DAY; t += 7 * DAY) s.push(t);
  return s;
}
