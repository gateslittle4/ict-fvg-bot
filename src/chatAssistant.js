// chatAssistant.js
// Assistant IA du dashboard (2026-09-15, Esdras : "est Il possible de mettre
// un IA dans le chat de Mon bot pour repondre a des questions sur Les
// données" - puis, pensant à l'investisseur qui n'est "pas un grand en
// trading" : "faudrait que lon explique comme si on en parlais avec
// quelqun de normal"). Répond à des questions en langage courant sur les
// VRAIES données du bot (journal durable Supabase + compte réel si
// connecté) - jamais de chiffre inventé, jamais de conseil financier
// personnalisé. Modèle Haiku 4.5 : largement suffisant pour expliquer en
// français simple des stats déjà calculées ailleurs dans le code (jamais
// de calcul de risque critique fait par le modèle lui-même), et de très
// loin le moins cher de la gamme Claude pour ce volume d'usage (un
// dashboard privé, pas un chatbot public).
import Anthropic from '@anthropic-ai/sdk';
import { fetchPerformanceBySymbol, fetchRecentTradeRows } from './dataSources/supabaseTradeLog.js';

const MODEL = 'claude-haiku-4-5';
const MAX_TURNS = 10; // 10 échanges (20 messages) gardés côté client et renvoyés à chaque appel - une conversation de chat n'a pas besoin de plus, et ça borne le coût/contexte
const MAX_MESSAGE_LENGTH = 2000;

let cachedClient = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

export function isChatConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Écrit pour un lecteur non-trader (l'investisseur qu'Esdras a en tête) autant
// que pour Esdras lui-même - explique les termes au lieu de les supposer
// connus, et le ton reste celui du rapport PDF déjà envoyé (honnête sur les
// limites, jamais de promesse de résultat).
const SYSTEM_PROMPT = `Tu es l'assistant du tableau de bord d'Apex FVG, un bot de trading automatisé développé par Esdras. Tu réponds à des questions sur les vraies données de ce bot, affichées à l'écran d'un dashboard privé.

QUI TE LIT :
Suppose que la personne n'a AUCUNE expérience en trading - ça peut être Esdras, ou un investisseur qu'il présente au projet. N'utilise jamais un terme technique sans l'expliquer en une phrase simple la première fois (exemples : "un multiple de R, c'est-à-dire le résultat d'un trade exprimé en multiple du montant risqué au départ - +2R veut dire qu'il a rapporté deux fois ce qui était risqué" ; "le drawdown, c'est la plus grosse baisse du capital par rapport à son sommet précédent"). Écris comme si tu expliquais ça à quelqu'un d'intelligent mais qui découvre le sujet, pas comme un rapport financier.

LA STRATÉGIE (pour contexte, si on te demande comment le bot fonctionne) :
Le bot combine 5 mécanismes de trading automatisés basés sur des concepts ICT (Inner Circle Trader) : détection de Fair Value Gap (FVG), Divergence (retour à la moyenne statistique), NWOG (gap d'ouverture de semaine), Judas Swing, et Weekly Sweep. Chaque mécanisme a été validé séparément sur des données historiques avant d'être activé en argent réel. Le risque est limité par trade (jamais tout misé sur un seul coup) et par des garde-fous (perte quotidienne max, nombre de trades max par jour, plancher de drawdown).

RÈGLES STRICTES :
1. N'utilise QUE les données fournies ci-dessous dans le contexte. N'invente jamais un chiffre. Si la question demande quelque chose que les données ne permettent pas de calculer avec certitude (ex: une agrégation par jour de semaine sur peu de trades), fais le calcul à partir des "recentTrades" fournis si c'est raisonnable, mais dis clairement que c'est un calcul approximatif sur un échantillon limité si l'échantillon est petit (moins de 20 trades pour la question posée).
2. Si les données manquent ou sont vides pour répondre à la question, dis-le honnêtement plutôt que de deviner.
3. Ne donne JAMAIS de conseil financier personnalisé ("tu devrais investir X", "c'est le bon moment pour toi"). Tu peux présenter des faits et des résultats de simulations déjà faites, jamais une recommandation d'investissement individualisée.
4. Les performances passées ne garantissent jamais les résultats futurs - rappelle-le si la question porte sur l'avenir ou sur une décision d'investir.
5. Réponds en français, de façon concise (c'est un chat, pas un rapport - quelques phrases ou un petit paragraphe suffisent, sauf si la question demande explicitement plus de détails).
6. Si on te demande ton avis sur "faut-il investir/prendre le challenge", rappelle que c'est une décision personnelle qui dépend de la tolérance au risque de chacun, et propose de regarder les faits pertinents (résultats réels, pire drawdown connu, etc.) plutôt que de trancher à la place de la personne.`;

/**
 * Rassemble les vraies données du bot à donner en contexte au modèle -
 * jamais calculées PAR le modèle, seulement expliquées par lui. Best-effort
 * sur chaque section : une source indisponible (pas connecté au broker,
 * Supabase pas configuré) devient un champ "reason"/"error" explicite dans
 * le JSON plutôt que de faire échouer toute la question.
 */
export async function buildChatContext(store) {
  const context = { generatedAt: new Date().toISOString() };

  if (store.mode === 'live' && typeof store.liveDataSource?.getAccountReconciliation === 'function') {
    try {
      context.account = await store.liveDataSource.getAccountReconciliation();
    } catch (err) {
      context.account = { error: err.message };
    }
  } else {
    context.account = { reason: 'not connected to a live broker' };
  }

  const tradeLogClient = store.liveDataSource?.tradeLogClient ?? null;
  const performance = await fetchPerformanceBySymbol(tradeLogClient, {});
  context.journal = {
    overall: performance.overall,
    bySymbol: performance.bySymbol,
    bySource: performance.bySource,
    reason: performance.reason,
  };
  // 90 jours : large fenêtre pour les questions ad hoc (jour de semaine,
  // session...), déjà bornée naturellement par le volume réel du bot.
  context.recentTrades = await fetchRecentTradeRows(tradeLogClient, { days: 90 });

  return context;
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS * 2)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
}

export async function answerChatQuestion({ message, history, context }) {
  const anthropic = getClient();
  if (!anthropic) throw new Error("L'assistant IA n'est pas configuré sur ce serveur (ANTHROPIC_API_KEY manquant).");

  const trimmedMessage = String(message ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmedMessage) throw new Error('message vide');

  const messages = [...sanitizeHistory(history), { role: 'user', content: trimmedMessage }];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      {
        // Bloc séparé + cache_control : les questions suivantes de la même
        // conversation renvoient le même contexte (Anthropic.messages.create
        // est sans état, tout l'historique est réenvoyé à chaque appel) -
        // ce bloc étant identique d'un appel à l'autre dans une même session,
        // le cache évite de le repayer en entier à chaque question.
        type: 'text',
        text: `Données actuelles du bot (JSON, ne jamais citer telles quelles - les reformuler en français simple) :\n${JSON.stringify(context)}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

/** Traduit une erreur SDK Anthropic en {status, message} présentable côté dashboard. */
export function chatErrorStatus(err) {
  if (err instanceof Anthropic.AuthenticationError) return { status: 502, message: 'Clé API Anthropic invalide ou expirée.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'Trop de questions à la fois - réessaie dans un instant.' };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Erreur de l'assistant IA : ${err.message}` };
  return { status: 500, message: err.message };
}
