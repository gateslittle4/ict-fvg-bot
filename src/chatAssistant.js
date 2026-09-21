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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { fetchPerformanceBySymbol, fetchRecentTradeRows } from './dataSources/supabaseTradeLog.js';
import { loadResearchMemory } from './backtest/researchMemory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKTEST_SUMMARY_PATH = path.join(__dirname, '..', 'data', 'backtest-summary.json');

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

// Backtest 7 ans (2019-2025), précalculé une fois par scripts/buildBacktestSummary.js
// et committé dans data/backtest-summary.json (2026-09-15, Esdras : "comment
// faire pour qu'il ai Les données des 7 annees?"). Rejouer 7 années de
// bougies à chaque message de chat serait beaucoup trop lent - lu depuis le
// disque et gardé en mémoire pour le process entier, régénéré manuellement
// via le script si la stratégie/config change un jour.
let cachedBacktestSummary;
function loadBacktestSummary() {
  if (cachedBacktestSummary !== undefined) return cachedBacktestSummary;
  try {
    cachedBacktestSummary = JSON.parse(fs.readFileSync(BACKTEST_SUMMARY_PATH, 'utf8'));
  } catch (err) {
    cachedBacktestSummary = { reason: `not available (${err.code === 'ENOENT' ? 'fichier manquant' : err.message})` };
  }
  return cachedBacktestSummary;
}

// Mémoire de recherche structurée (data/research-memory.json, voir
// src/backtest/researchMemory.js) - index des hypothèses déjà testées dans
// ce projet (mécanismes live, idées rejetées, corrections de méthodologie).
// Chargée une fois et gardée en mémoire comme le backtest ci-dessus :
// c'est un fichier committé, pas une donnée qui change en cours de process.
let cachedResearchMemory;
function loadResearchMemoryForChat() {
  if (cachedResearchMemory !== undefined) return cachedResearchMemory;
  try {
    cachedResearchMemory = loadResearchMemory();
  } catch (err) {
    cachedResearchMemory = { reason: `not available (${err.code === 'ENOENT' ? 'fichier manquant' : err.message})` };
  }
  return cachedResearchMemory;
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

DEUX SOURCES DE DONNÉES DISTINCTES DANS LE CONTEXTE - ne jamais les mélanger dans une réponse sans préciser laquelle :
- "journal"/"recentTrades" : le VRAI trading en argent réel depuis que le suivi a été mis en place. C'est la performance réelle du bot.
- "backtest7Years" : une SIMULATION sur 7 années de données de marché historiques (2019-2025), rejouée avec le code exact de production, mais ce n'est PAS de l'argent réel - c'est "qu'est-ce que le bot aurait fait s'il avait tourné pendant ces 7 années". Utile pour parler de tendances saisonnières (quel mois est historiquement plus faible/fort) ou de résultats sur un grand échantillon, mais dis-le clairement quand tu t'appuies dessus : "sur la simulation historique 2019-2025..." plutôt que de laisser croire que c'est du réel.
- "researchMemory" : un INDEX des recherches déjà faites sur ce projet (pas des données de marché) - une liste d'entrées, chacune avec un statut ("live" = mécanisme actif dans le bot réel, "validated-research" = piste confirmée mais pas encore activée en réel, "rejected" = testée et abandonnée, "methodology-fix" = une correction d'un biais de mesure qui a affecté d'autres résultats, "inconclusive" = signal trop faible pour trancher). Utilise-le pour répondre à "est-ce qu'on a déjà testé X ?" ou "pourquoi tel mécanisme n'est pas activé ?" en citant le titre, le statut et le résumé de l'entrée pertinente - jamais pour inventer un chiffre de performance qui ne s'y trouve pas déjà explicitement. IMPORTANT : si une entrée "methodology-fix" ou "rejected" contredit un chiffre optimiste ailleurs (par exemple un résultat de backtest7Years calculé avant une correction connue), dis-le clairement et privilégie l'entrée de researchMemory.

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

  // Backtest 2019-2025 (7 années) - données historiques rejouées, distinctes
  // du journal réel ci-dessus. Voir loadBacktestSummary().
  context.backtest7Years = loadBacktestSummary();

  // Index des recherches déjà faites sur ce projet - voir researchMemory.js.
  context.researchMemory = loadResearchMemoryForChat();

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

// --- Mentor : un commentaire par trade clôturé (2026-09-19, roadmap n° 6) -----------------
// Le modèle ne calcule RIEN et ne voit que le débrief déjà établi par tradeDebrief.js
// (faits chiffrés, rédigés en phrases) : il les reformule en conseil de mentor. Même
// modèle et même client que le chat, donc même ANTHROPIC_API_KEY ; sans clé, la fonction
// lève l'erreur habituelle et le débrief factuel reste affiché tel quel.
const MENTOR_SYSTEM_PROMPT = `Tu es le mentor de trading d'Esdras. On te donne UN trade clôturé du bot Apex FVG et un débrief factuel déjà calculé (session, niveaux proches, excursions du prix, historique de trades comparables). Écris un commentaire de mentor en français, en 90 mots maximum, ton direct et bienveillant, en tutoyant.

RÈGLES STRICTES :
1. N'utilise QUE les faits fournis. N'invente aucun chiffre, aucun niveau, aucune cause. Si un fait manque, ne le mentionne pas.
2. Structure : une chose bien faite (ou neutre si rien), puis UNE chose à regarder, puis une phrase qui rappelle qu'un seul trade est un échantillon minuscule.
3. Jamais de conseil financier personnalisé ni de promesse de résultat. Ne suggère pas de changer une règle du bot sur la base d'un seul trade.
4. Explique tout terme technique en quelques mots.`;

/** Le message utilisateur envoyé au mentor - séparé pour pouvoir être vérifié sans appel réseau. */
export function buildMentorPrompt(trade, debrief) {
  const lines = debrief.notes.map((n) => `- ${n.text}`).join('\n');
  return `Trade : ${trade.direction === 'bullish' ? 'achat' : 'vente'} ${trade.symbol}, stratégie ${trade.source ?? 'inconnue'}, `
    + `résultat ${trade.rMultiple === null || trade.rMultiple === undefined ? 'inconnu en R' : `${trade.rMultiple} R`}.\nDébrief factuel :\n${lines}`;
}

export async function answerTradeMentor({ trade, debrief }) {
  const anthropic = getClient();
  if (!anthropic) throw new Error("L'assistant IA n'est pas configuré sur ce serveur (ANTHROPIC_API_KEY manquant).");
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: MENTOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildMentorPrompt(trade, debrief) }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}
