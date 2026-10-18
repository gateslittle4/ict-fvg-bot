// cTraderTokens.js - renouvellement automatique du jeton d'accès cTrader (2026-10-18).
//
// Pourquoi : le jeton d'accès cTrader dure ~30 jours (docs/CTRADER_SETUP.md). Le 2026-10-11 il a expiré : chaque démarrage
// authentifiait l'application puis échouait sur ProtoOAAccountAuthReq, et le bot retombait en mode démo sans aucune erreur lisible
// (l'erreur du courtier est un objet sans `.message`, le journal affichait « undefined »).
//
// Comportement : au démarrage, authorizeWithRefresh() essaie le jeton courant ; s'il est refusé (ou proche de l'expiration) et qu'un
// refreshToken est connu, il en demande un nouveau (GET https://openapi.ctrader.com/apps/token?grant_type=refresh_token...) puis
// réessaie UNE fois. Les nouveaux jetons sont gardés dans la table bot_broker_tokens (Supabase) : le refreshToken est renouvelé à chaque
// usage, donc sans cette persistance le démarrage suivant repartirait d'un ancien refreshToken (variables d'environnement) devenu invalide.
// Si le jeton d'environnement a été changé à la main depuis (empreinte différente), les jetons stockés sont ignorés.
// Aucun jeton n'est jamais écrit dans les journaux.

import crypto from 'node:crypto';

export const TOKEN_URL = 'https://openapi.ctrader.com/apps/token';
export const REFRESH_AHEAD_MS = 3 * 24 * 3600 * 1000; // renouveler au démarrage si l'expiration connue est dans moins de 3 jours

/** Texte lisible d'une erreur du courtier (objet sans .message, code/description, ou Error). Jamais de jeton. */
export function describeBrokerError(err) {
  if (err == null) return 'erreur inconnue (undefined)';
  if (typeof err === 'string') return err;
  const parts = [];
  const code = err.errorCode ?? err.code ?? err.payloadType;
  if (code != null) parts.push(`code=${code}`);
  const text = err.description ?? err.message;
  if (text) parts.push(String(text));
  if (parts.length) return parts.join(' ');
  try {
    return JSON.stringify(err, (k, v) => (/token|secret|password/i.test(k) ? '[masqué]' : typeof v === 'bigint' ? String(v) : v)).slice(0, 300);
  } catch {
    return String(err);
  }
}

export const fingerprint = (token) => (token ? crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16) : null);

/** Demande un nouveau jeton. Renvoie { accessToken, refreshToken, expiresAt } ou lève une Error lisible. */
export async function refreshAccessToken({ clientId, clientSecret, refreshToken, fetchImpl = fetch, now = Date.now() }) {
  if (!clientId || !clientSecret || !refreshToken) throw new Error('refresh impossible : clientId, clientSecret ou refreshToken manquant');
  const url = `${TOKEN_URL}?${new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret })}`;
  let res;
  try {
    res = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw new Error(`refresh impossible (réseau) : ${describeBrokerError(err)}`);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`refresh impossible : réponse non JSON (HTTP ${res.status})`);
  }
  if (!res.ok || body.errorCode || !body.accessToken) {
    throw new Error(`refresh refusé par cTrader (HTTP ${res.status}) : ${body.errorCode ?? ''} ${body.description ?? ''}`.trim());
  }
  const expiresInSec = Number(body.expiresIn);
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken || refreshToken,
    expiresAt: Number.isFinite(expiresInSec) && expiresInSec > 0 ? now + expiresInSec * 1000 : null,
  };
}

/** Stockage Supabase des jetons renouvelés (table bot_broker_tokens). Tout échec est non fatal et renvoyé en clair. */
export function createBrokerTokenStore(client, table = 'bot_broker_tokens') {
  if (!client) return null;
  return {
    async load(accountKey) {
      const { data, error } = await client.from(table).select('*').eq('account_key', accountKey).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at ? Date.parse(data.expires_at) : null, envFingerprint: data.env_fingerprint } : null;
    },
    async save(accountKey, rec) {
      const { error } = await client.from(table).upsert({
        account_key: accountKey,
        access_token: rec.accessToken,
        refresh_token: rec.refreshToken,
        expires_at: rec.expiresAt ? new Date(rec.expiresAt).toISOString() : null,
        env_fingerprint: rec.envFingerprint,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * @param {object} o
 * @param {(accessToken: string) => Promise<any>} o.authFn  appelle ProtoOAAccountAuthReq ; lève en cas de refus
 * @param {{clientId, clientSecret, accessToken, refreshToken?}} o.creds  jetons d'ENVIRONNEMENT / config
 * @param {{load, save}|null} o.store
 * @param {string} o.accountKey
 * @returns {Promise<{accessToken: string, refreshed: boolean}>}  jeton qui a fonctionné
 */
export async function authorizeWithRefresh({ authFn, creds, store, accountKey, fetchImpl = fetch, now = Date.now(), log = console }) {
  const envFp = fingerprint(creds.accessToken);
  let current = { accessToken: creds.accessToken, refreshToken: creds.refreshToken || null, expiresAt: null };
  if (store) {
    try {
      const saved = await store.load(accountKey);
      if (saved && saved.envFingerprint === envFp && saved.accessToken) current = saved; // sinon : jeton d'environnement changé à la main -> on repart de lui
    } catch (err) {
      log.warn(`[cTrader] jetons stockés illisibles (non fatal, on utilise ceux de l'environnement) : ${describeBrokerError(err)}`);
    }
  }

  const doRefresh = async (reason) => {
    log.warn(`[cTrader] renouvellement du jeton d'accès (${reason})...`);
    const fresh = await refreshAccessToken({ clientId: creds.clientId, clientSecret: creds.clientSecret, refreshToken: current.refreshToken, fetchImpl, now });
    current = fresh;
    if (store) {
      try {
        await store.save(accountKey, { ...fresh, envFingerprint: envFp });
        log.log('[cTrader] nouveaux jetons enregistrés (bot_broker_tokens).');
      } catch (err) {
        log.error(`[cTrader] ATTENTION : jeton renouvelé mais NON enregistré (${describeBrokerError(err)}) : au prochain démarrage le refreshToken de l'environnement peut être périmé - mettre à jour CTRADER_ACCESS_TOKEN / CTRADER_REFRESH_TOKEN sur Render.`);
      }
    } else {
      log.error('[cTrader] ATTENTION : jeton renouvelé mais pas de stockage Supabase configuré : au prochain démarrage le refreshToken de l\'environnement peut être périmé.');
    }
  };

  // Renouvellement préventif : expiration connue et proche.
  if (current.refreshToken && current.expiresAt && current.expiresAt - now < REFRESH_AHEAD_MS) {
    try {
      await doRefresh('expiration proche');
    } catch (err) {
      log.warn(`[cTrader] renouvellement préventif échoué (on essaie quand même le jeton actuel) : ${describeBrokerError(err)}`);
    }
  }

  try {
    await authFn(current.accessToken);
    return { accessToken: current.accessToken, refreshed: false };
  } catch (firstErr) {
    const firstMsg = describeBrokerError(firstErr);
    if (!current.refreshToken) {
      throw new Error(`autorisation du compte refusée (${firstMsg}) et aucun CTRADER_REFRESH_TOKEN configuré : renouveler le jeton à la main (docs/CTRADER_SETUP.md)`);
    }
    try {
      await doRefresh(`autorisation refusée : ${firstMsg}`);
    } catch (refreshErr) {
      throw new Error(`autorisation du compte refusée (${firstMsg}) et renouvellement impossible : ${describeBrokerError(refreshErr)}`);
    }
    try {
      await authFn(current.accessToken);
    } catch (secondErr) {
      throw new Error(`autorisation du compte refusée même après renouvellement : ${describeBrokerError(secondErr)}`);
    }
    return { accessToken: current.accessToken, refreshed: true };
  }
}
