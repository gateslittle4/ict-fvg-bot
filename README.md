# ICT FVG Assistant

Assistant de trading (pas un bot autonome) : surveille US100, US500, EUR/USD et
GBP/USD sur M15, détecte les Fair Value Gaps (ICT), et te dit quand ta
stratégie est respectée — mais c'est toujours TOI qui cliques Buy/Sell.
Objectif: te faire gagner du temps tout en bloquant l'overtrading et le
revenge trading.

## Ce que ça fait

- **Détection FVG (M15)** avec deux niveaux d'alerte : "FVG formé — à
  surveiller" puis "entrée validée" quand le prix revient dans la zone.
- **Garde-fous anti-overtrading / anti-revenge-trading** : max 2 trades/jour,
  cooldown de 30 min après une perte, coupure totale des signaux si -2% sur
  la journée.
- **Calculateur de lot** : 0.5% de risque par trade, taille calculée depuis
  ton solde + les specs de l'instrument.
- **Dashboard web** + **push notifications** (ntfy.sh) sur les entrées
  validées.
- **Journal de trades automatique** une fois connecté à ton compte cTrader
  (FundingPips) — pas de saisie manuelle nécessaire.

## Statut actuel

Tourne en **mode démo** (données de marché simulées) tant que les
identifiants cTrader ne sont pas fournis — voir `docs/CTRADER_SETUP.md`.
Toute la logique métier (détection FVG, garde-fous, calculateur de lot) est
testée unitairement et fonctionne déjà ; seule la connexion live au compte
réel reste à brancher et à tester avec de vraies données une fois que tu as
complété la procédure cTrader.

## Lancer en local

```bash
npm install
npm test        # 22 tests unitaires (FVG engine, guardrails, lot calculator)
npm start        # démarre le dashboard sur http://localhost:3000
```

## Structure

```
src/
  config.js                     # tous les réglages (risque, garde-fous, symboles)
  store.js                      # état runtime partagé
  engines/
    fvgEngine.js                # détection Fair Value Gap
    guardrailEngine.js          # anti-overtrading / anti-revenge-trading
    lotCalculator.js             # calcul de taille de position
  dataSources/
    mockDataSource.js           # données simulées (mode démo)
    cTraderDataSource.js        # connexion live cTrader Open API (non testée en direct)
  server.js                     # serveur Express + API + dashboard
public/index.html                # dashboard (une seule page)
test/                             # tests unitaires (node:test)
docs/CTRADER_SETUP.md            # guide de connexion du compte réel
```

## Limites connues (honnêteté avant tout)

- Les **specs de contrat** (valeur du point/pip par lot) pour US100/US500
  dans `lotCalculator.js` sont **indicatives**, pas confirmées par
  FundingPips — à vérifier via l'API live avant tout usage réel. Le
  dashboard affiche un avertissement tant que ce n'est pas vérifié.
- La détection FVG est une version simplifiée (règle des 3 bougies) — elle
  ne couvre pas encore les autres concepts ICT (killzones, liquidity sweep,
  break of structure) que tu n'as pas demandés pour cette première version.
- Le module `cTraderDataSource.js` est écrit à partir de la documentation
  officielle mais **n'a pas encore tourné contre un vrai compte** (il n'y a
  pas encore d'identifiants) — le premier lancement live sera à traiter
  comme un test d'intégration, à surveiller de près.
- Les push notifications (ntfy.sh) n'ont pas pu être testées bout-en-bout
  depuis cet environnement de développement (accès réseau restreint), mais
  la mécanique est standard et devrait fonctionner une fois déployé sur
  Render (accès réseau ouvert).
