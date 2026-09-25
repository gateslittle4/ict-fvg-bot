// weekendClose.js - règle de data/backtest-input/preregistration-weekend-close-2026-09-25.md, amendement compris (testée dans
// test/weekendClose.test.js).
import { toRealNyHourMinute } from '../../src/backtest/nySession.js';

const H = 3600000;
/** Heure de New York (heure d'été comprise) d'un temps moteur (UTC - 5 h fixe) : { day (0 = dimanche), minute du jour }. */
function nyLocal(t) {
  const { hour, minute } = toRealNyHourMinute(t);
  const local = t + (hour !== new Date(t).getUTCHours() ? H : 0); // heure d'été : New York = temps moteur + 1 h
  return { day: new Date(local).getUTCDay(), minute: hour * 60 + minute };
}

/** Vendredi, 16:45 ou plus tard, heure de New York. */
export function fridayCloseReached(t) {
  const { day, minute } = nyLocal(t);
  return day === 5 && minute >= 16 * 60 + 45;
}

/**
 * Faut-il fermer à la bougie `t` ? Vendredi (New York) et 16:45 atteint, ou dernière bougie du vendredi (la suivante, `nextT`, arrive au
 * moins 36 h plus tard : les données de la semaine s'arrêtent avant 16:45).
 */
export function weekendCloseAt(t, nextT) {
  if (nyLocal(t).day !== 5) return false;
  return fridayCloseReached(t) || !(nextT - t < 36 * H);
}
