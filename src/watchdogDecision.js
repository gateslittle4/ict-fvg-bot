// watchdogDecision.js
// Pure decision layer for the external watchdog (see
// .github/workflows/watchdog.yml). Given what /healthz answered - or the fact
// that it did not answer at all - decide whether to alert, and with what
// words. Kept pure so every branch below is tested: a watchdog whose logic is
// only exercised in production is a watchdog nobody can trust when it stays
// silent.
//
// WHY THE ALERTS ARE WORDED FOR A PHONE
// These land as ntfy pushes on Esdras's phone, usually mid-day, often while
// he is not near a screen. So each message says what broke and what it means
// for trading, never a field name or a status code on its own.

// A feed that has said nothing for this long, while the market is open, is
// not "quiet" - it is broken. Generous on purpose: the thinnest watched
// instrument still prints an M15 candle well inside this, and a threshold
// that fires on a slow hour trains the reader to ignore the alarm.
export const STALE_FEED_SEC = 30 * 60;

// A refusal older than this is history, not news - it has already been
// reported once, and the process keeps the field until it restarts.
export const RECENT_REJECTION_SEC = 60 * 60;

export const OK = 'ok';

/**
 * Pure. Returns { state, title, body } - state is OK or a short machine key
 * used to suppress repeats.
 *
 * @param {object|null} health  parsed /healthz body, or null if unreachable
 * @param {string|null} fetchError  why it was unreachable, if it was
 */
export function decideWatchdogAlert({ health = null, fetchError = null } = {}) {
  // 1. The process is gone. Nothing else can be evaluated - deliberately
  //    first, because every other signal reads null in this case.
  if (health === null) {
    return {
      state: 'unreachable',
      title: 'Bot injoignable',
      body:
        `Le bot ne répond plus du tout${fetchError ? ` (${fetchError})` : ''}. ` +
        `Il ne surveille plus le marché et ne passera aucun ordre tant qu'il n'est pas relancé.`,
    };
  }

  // 2. The market is closed: the service is asleep BY DESIGN (keepAlive.js's
  //    market-hours gate), so everything below would be a false alarm. This
  //    is why /healthz serves marketOpen rather than having this file carry
  //    its own DST-aware copy of the calendar.
  if (health.marketOpen === false) return { state: OK, title: null, body: null };

  // 3. The broker socket is gone. The site answers, so this is invisible
  //    from the dashboard alone.
  if (health.accountsConnected === 0) {
    return {
      state: 'broker-disconnected',
      title: 'Connexion courtier perdue',
      body: 'Le bot tourne mais n\'est plus connecté à cTrader. Aucun signal ne peut être exécuté.',
    };
  }

  // 4. Orders are being attempted and refused. Worth alerting even though
  //    everything above is green - this is precisely the 2026-09-16..18
  //    incident, where the bot looked perfectly healthy and traded nothing.
  if (health.lastOrderRejectionAgeSec !== null && health.lastOrderRejectionAgeSec <= RECENT_REJECTION_SEC) {
    const reason = health.lastOrderRejectionCode ? ` Motif : ${health.lastOrderRejectionCode}.` : '';
    return {
      state: `order-rejected:${health.lastOrderRejectionCode ?? 'sans-code'}`,
      title: 'Ordre refusé par le courtier',
      body: `Le bot a envoyé un ordre et le courtier l'a refusé.${reason} Aucune position n'a été ouverte.`,
    };
  }

  // 5. Orders are being attempted and vanishing without any answer - a
  //    different failure from a refusal, and it needs a different fix.
  if (health.unconfirmedOrderStreak > 0) {
    return {
      state: 'order-unconfirmed',
      title: 'Ordre sans confirmation',
      body:
        `${health.unconfirmedOrderStreak} ordre(s) envoyés sans aucune réponse du courtier. ` +
        `Impossible de savoir s'ils ont été pris : à vérifier dans cTrader.`,
    };
  }

  // 6. The feed went silent. Last because it is the slowest to become
  //    certain, and because a bot with a dead feed still looks alive.
  if (health.lastCandleAgeSec !== null && health.lastCandleAgeSec > STALE_FEED_SEC) {
    return {
      state: 'feed-stale',
      title: 'Plus aucune bougie reçue',
      body:
        `Aucune nouvelle bougie depuis ${Math.round(health.lastCandleAgeSec / 60)} minutes alors que le marché est ouvert. ` +
        `Le bot a l'air en bonne santé mais ne peut plus déclencher aucun signal.`,
    };
  }

  return { state: OK, title: null, body: null };
}

/**
 * Pure. Should this alert actually be sent, given what was sent last time?
 * Alerting every 10 minutes for a fault that lasts all afternoon is how an
 * alarm gets muted, so only a CHANGE of state speaks - plus one explicit
 * all-clear when things recover, which is the message that lets Esdras stop
 * worrying without opening anything.
 */
export function decideNotification(current, previousState = null) {
  if (current.state === OK) {
    if (previousState && previousState !== OK) {
      return { send: true, title: 'Bot de nouveau opérationnel', body: 'Le problème signalé précédemment est résolu.' };
    }
    return { send: false, title: null, body: null };
  }
  if (current.state === previousState) return { send: false, title: null, body: null };
  return { send: true, title: current.title, body: current.body };
}
