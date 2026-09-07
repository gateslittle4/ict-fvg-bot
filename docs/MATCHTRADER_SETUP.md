# Connecter ton compte FundingPips (Match-Trader) — guide pas à pas

Suite à la décision de passer de cTrader à Match-Trader : la bonne nouvelle, c'est qu'il n'y a **aucune approbation à attendre** de la part d'un tiers (contrairement à cTrader/Spotware) — tu t'authentifies directement avec tes identifiants de connexion habituels. Le processus est donc plus court, mais deux valeurs (`brokerId` et l'URL de la plateforme) ne sont pas publiées publiquement par Match-Trader ni par FundingPips — il faut les demander au support FundingPips. C'est la seule étape qui dépend de quelqu'un d'autre que toi.

## 1. Ce que tu as déjà (rien à créer de nouveau)

Tes identifiants de connexion Match-Trader FundingPips habituels :
- **Email** (celui avec lequel tu te connectes à ton compte FundingPips/Match-Trader)
- **Mot de passe**

Aucun nouveau compte développeur, aucune "app" à enregistrer nulle part.

## 2. Demander 2 informations au support FundingPips

Contacte le support FundingPips (chat en direct ou ticket) et demande précisément :
1. Le **`brokerId`** à utiliser pour appeler l'API Match-Trader de FundingPips.
2. L'**URL de la plateforme** (`platformUrl`) correspondant à ton instance FundingPips — et si un environnement démo existe séparément de l'environnement réel/financé, pour tester d'abord sans risque (même logique que le compte démo cTrader qu'on visait avant).

⚠️ Ces deux valeurs sont spécifiques à FundingPips (Match-Trader est une plateforme "marque blanche" utilisée par plusieurs brokers différents) — je n'ai trouvé aucune documentation publique qui les liste, donc mieux vaut les demander directement plutôt que deviner.

## 3. Comment le bot se connectera ensuite (une fois les 2 valeurs obtenues)

Avec email + mot de passe + `brokerId`, le bot échange ces informations contre un accès qui dure environ 1 heure, renouvelable automatiquement en arrière-plan (pas besoin de te reconnecter à la main). C'est moi qui code cette partie une fois les valeurs reçues — tu n'as rien à faire de technique ici.

Ensuite, le bot peut :
- Lire les prix en direct (vérification toutes les 15 minutes, comme avant)
- Envoyer un ordre (marché ou en attente, avec stop loss et take profit déjà attachés — même principe de sécurité que sur cTrader)
- Être informé automatiquement quand une position se ferme

## 4. Ce qu'il me faut au final

Trois valeurs à me transmettre (ou à poser en variables d'environnement `MATCHTRADER_EMAIL`, `MATCHTRADER_PASSWORD`, `MATCHTRADER_BROKER_ID`, `MATCHTRADER_PLATFORM_URL`) :
- Email
- Mot de passe
- `brokerId` (obtenu du support FundingPips)
- URL de plateforme (obtenue du support FundingPips)

⚠️ **Ne jamais partager le mot de passe en clair dans le chat** — mets-le directement en variable d'environnement du déploiement, ou dis-le-moi par un canal plus sûr si on doit le tester ensemble une fois.

## 5. Compte démo d'abord (si disponible)

Même recommandation que pour cTrader : si le support FundingPips confirme qu'un environnement démo existe pour Match-Trader, on teste d'abord là pendant quelques jours (les FVG détectés correspondent bien à ce qui est visible sur le graphique, les tailles de lot sont cohérentes, les garde-fous se déclenchent au bon moment) avant de brancher le compte réel/financé.

## 6. Ce qui reste à vérifier une fois connecté (avant de faire confiance à l'exécution automatique)

- Le format exact des symboles côté Match-Trader (ex. `US100` s'appelle peut-être différemment — à confirmer au premier appel réussi de l'API).
- Les vraies specs de contrat (taille de lot minimum, pas de volume) pour US100/US500/XAUUSD sur cette plateforme — le calculateur de lot actuel (`src/engines/lotCalculator.js`) est basé sur des valeurs indicatives à vérifier, comme c'était déjà noté pour cTrader.
- La cadence de rafraîchissement des prix : contrairement à cTrader (qui pousse les prix en direct), Match-Trader ne documente pas de flux de prix en direct pour les cotations — le bot devra interroger l'API à intervalle régulier (ce qui correspond de toute façon à notre cadence M15 actuelle, donc pas un problème pratique).

## 7. Connecteur écrit — `src/dataSources/matchTraderDataSource.js` (2026-09-07)

Le code existe maintenant (même statut que `cTraderDataSource.js` l'était : écrit contre la documentation, **jamais testé en vrai**). Deux limites RÉELLES de l'API Match-Trader découvertes en écrivant ce fichier, à connaître avant de brancher un compte réel :

- **Aucun endpoint d'historique de bougies n'existe** dans la documentation Platform API (seulement une "photo" des prix en direct, `quotations`). Le bot construit donc ses bougies M15 lui-même en interrogeant les prix toutes les 15 secondes et en les agrégeant (`M15CandleBuilder`, testé unitairement). Conséquence concrète : au moment de la connexion, il n'y a AUCUN historique pour calculer les filtres (biais H4/EMA200, etc.) — nos CSV existants s'arrêtent au 31 décembre 2025, trop loin de la date d'aujourd'hui pour servir de base fiable. Le bot va donc rester "silencieux" (peu ou pas de signaux) pendant une vraie période de rodage après la connexion, le temps d'accumuler assez d'historique en direct. Piste à explorer plus tard : utiliser cTrader UNIQUEMENT comme source de données de marché (lecture seule, un compte démo suffit, pas besoin d'attendre FundingPips) pendant que Match-Trader gère l'exécution des ordres.
- **La réponse au moment de créer un ordre ne contient pas d'identifiant confirmé** — le bot doit donc "retrouver" l'ordre juste après l'avoir passé en relisant la liste des ordres en attente, une méthode d'appariement approximative (par instrument + sens), pas garantie à 100% si un ordre est aussi placé manuellement au même moment sur le même instrument.

À la première connexion réelle (idéal : sur la démo Born2trade suggérée), il faudra vérifier en particulier : le nom exact des instruments, si `co-auth` est bien fourni en cookie (sinon `MatchTraderDataSource._login` a un repli sur `token` dans la réponse), et si `/last-finance` fournit vraiment l'historique de P&L réalisé (documentation incertaine sur ce point).
