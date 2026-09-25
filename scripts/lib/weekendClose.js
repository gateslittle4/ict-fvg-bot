// weekendClose.js - règle de data/backtest-input/preregistration-weekend-close-2026-09-25.md (testée dans test/weekendClose.test.js).
import { toRealNyHourMinute } from '../../src/backtest/nySession.js';

/** Vendredi, 16:45 ou plus tard, heure de New York (heure d'été comprise) ; `t` en temps moteur (UTC - 5 h fixe). */
export function fridayCloseReached(t) {
  const { hour, minute } = toRealNyHourMinute(t);
  const local = t + (hour !== new Date(t).getUTCHours() ? 3600000 : 0); // heure d'été : New York = temps moteur + 1 h
  return new Date(local).getUTCDay() === 5 && hour * 60 + minute >= 16 * 60 + 45;
}
