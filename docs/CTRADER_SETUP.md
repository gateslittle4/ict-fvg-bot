# Connecter ton compte FundingPips (cTrader) — guide pas à pas

Cette étape ne peut être faite que par toi : elle demande de te connecter avec ton propre compte cTrader/FundingPips. Une fois les 4 valeurs ci-dessous obtenues, donne-les moi (ou mets-les dans les variables d'environnement du déploiement) et je branche tout.

## 1. Ouvrir un compte cTrader chez FundingPips (si pas déjà fait)

Au moment de l'achat/activation de ton challenge FundingPips, choisis **cTrader** comme plateforme (pas MT5, pas Match-Trader), pour bénéficier de l'API publique.

## 2. Enregistrer une application sur le portail Open API

1. Va sur **https://openapi.ctrader.com** et connecte-toi avec ton compte cTrader ID (le même identifiant que celui utilisé pour FundingPips en cTrader).
2. Va sur la page **https://openapi.ctrader.com/apps** et clique **"Add new app"**.
3. Remplis le formulaire. Il te sera demandé :
   - Un nom (ex: "ICT FVG Assistant")
   - Une **redirect URI** — mets l'URL du dashboard une fois déployé, suivi de `/oauth/callback` (ex: `https://ton-app.onrender.com/oauth/callback`). Si tu ne l'as pas encore, mets temporairement `http://localhost:3000/oauth/callback`, on l'ajustera après le déploiement.
4. Clique **Save**. L'app apparaît dans ta liste avec le statut **"submitted"** — ce n'est PAS instantané : Spotware (l'éditeur de cTrader) doit valider la demande manuellement et te contacte par email pour l'approbation (ou pour demander des précisions). Ça peut prendre de quelques heures à quelques jours — lance cette étape maintenant même si on n'utilise pas encore l'accès tout de suite, pour ne pas attendre plus tard.
5. Une fois approuvée, l'app te donne un **Client ID** et un **Client Secret** — garde-les précieusement (le Secret ne se réaffiche généralement qu'une fois). C'est aussi seulement une fois approuvée que tu peux ajouter/confirmer la redirect URI pour l'étape suivante.

## 3. Autoriser ton compte de trading (OAuth)

1. Construis cette URL (remplace `{clientId}` et `{redirectUri}` par tes vraies valeurs) et ouvre-la dans un navigateur :
   ```
   https://id.ctrader.com/my/settings/openapi/grantingaccess/?client_id={clientId}&redirect_uri={redirectUri}&scope=trading
   ```
   `scope=trading` donne l'accès complet (lecture ET passage d'ordres) — nécessaire pour le bot en direct plus tard. Si tu veux SEULEMENT récupérer l'historique des prix pour l'instant, tu peux mettre `scope=accounts` (lecture seule, plus prudent), mais il faudra refaire cette étape avec `scope=trading` quand tu voudras connecter le bot en direct. Autant faire `trading` tout de suite si tu comptes aller jusqu'au bout.
2. Connecte-toi avec tes identifiants cTrader/FundingPips et autorise l'accès.
3. Tu seras redirigé vers ta redirect URI avec un paramètre `?code=...` dans l'adresse — copie ce code tout de suite (il n'est valable qu'une minute).

## 4. Échanger le code contre un Access Token

Depuis un terminal (ou dis-le moi et je le fais avec toi), lance :
```
curl "https://openapi.ctrader.com/apps/token?grant_type=authorization_code&code=LE_CODE&redirect_uri=TA_REDIRECT_URI&client_id=TON_CLIENT_ID&client_secret=TON_CLIENT_SECRET"
```
La réponse contient un `accessToken` (valable environ 30 jours) et un `refreshToken` à garder précieusement pour en obtenir un nouveau sans repasser par l'étape 3 une fois qu'il expire.

## 5. Trouver ton Account ID (ctidTraderAccountId)

C'est l'identifiant technique de ton compte FundingPips spécifique (tu peux avoir plusieurs comptes sous le même login cTrader ID — démo, challenge, financé). Je peux le récupérer automatiquement dès que j'ai ton access token, via l'API — pas besoin de le chercher toi-même.

## Ce qu'il me faut au final

Quatre valeurs à me transmettre (ou à poser en variables d'environnement `CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET`, `CTRADER_ACCESS_TOKEN`, `CTRADER_ACCOUNT_ID`) :
- Client ID
- Client Secret
- Access Token
- Account ID (ctidTraderAccountId) — je peux le déduire pour toi si tu n'as que les 3 premiers

## Important : compte démo d'abord

Avant de brancher ton compte réel/financé, je recommande fortement de tester d'abord avec un **compte démo cTrader** (host `demo.ctraderapi.com`, déjà configuré par défaut dans le code) pendant quelques jours, pour vérifier que :
- les FVG détectés correspondent à ce que tu attends visuellement sur ton chart
- le calculateur de lot donne des tailles cohérentes avec les vraies spécifications de contrat US100/US500/forex de FundingPips (à vérifier une fois connecté — voir l'avertissement "spec indicative" dans le calculateur)
- les garde-fous se déclenchent au bon moment

Une fois validé en démo, on repointe simplement vers `live.ctraderapi.com` et ton compte réel.

## Pyramide automatique (2e unité à +1R) — nouveau, désactivé par défaut

Le bot peut maintenant, en plus d'alerter pour l'entrée principale, envoyer LUI-MÊME l'ordre de la 2e unité de la pyramide "stops indépendants" (voir HANDOFF.md) quand le prix atteint +1R sur US100/US500 — sans toucher au stop de la position d'origine. C'est utile si tu n'es pas devant l'écran au bon moment, mais c'est aussi la première fonctionnalité de ce projet qui ENVOIE de vrais ordres, pas seulement qui lit des prix.

Deux conditions avant de pouvoir l'activer :
1. Le `scope=trading` de l'étape 3 ci-dessus (pas `scope=accounts`) — sans ça, tes ordres seront refusés par le broker.
2. La taille de lot (`DEFAULT_SYMBOL_SPECS` dans `src/engines/lotCalculator.js`) doit être vérifiée avec les vraies specs de contrat FundingPips, ET le format exact du champ `volume` de l'API doit être confirmé une fois connecté en démo (voir les commentaires "VERIFY" dans `src/dataSources/cTraderDataSource.js`) — une mauvaise conversion enverrait un ordre de la mauvaise taille.

Tant que ces deux points ne sont pas confirmés, la fonctionnalité reste éteinte (`PYRAMID_ENABLED` n'est pas définie ou vaut autre chose que `true`) — rien ne change dans le comportement actuel. Une fois prêt à tester : `PYRAMID_ENABLED=true` en variable d'environnement, et à tester d'abord en démo comme le reste.

## Mode indisponible (exécution automatique de l'entrée elle-même)

Contrairement à `PYRAMID_ENABLED` (un réglage de déploiement, à activer une fois pour toutes après vérification), le "mode indisponible" est pensé pour être activé/désactivé À LA VOLÉE par Esdras lui-même, depuis le dashboard (bouton "Activer 4h/8h/24h/72h") ou via `POST /api/auto-execute`. Pendant la fenêtre choisie, le bot envoie lui-même l'ordre d'entrée dès qu'un signal valide — le reste du temps, rien ne change (alerte, clic manuel).

Mêmes prérequis techniques que la pyramide automatique ci-dessus (scope OAuth `trading`, specs de lot vérifiées) avant de faire confiance à cette fonctionnalité avec de l'argent réel — et même recommandation : tester d'abord en démo, en activant une courte fenêtre (ex: "Activer 4h") pour observer un ou deux cycles complets avant de s'en servir sur une vraie fin de mois.
