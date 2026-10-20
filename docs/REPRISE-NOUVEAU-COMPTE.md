# Reprise du projet ICT FVG bot (note pour un nouveau compte Claude)

Écrite le 2026-10-06. À lire en premier si tu reprends ce projet avec un autre compte Claude. Ce fichier remplace la mémoire de la conversation précédente, qui ne suit pas d'un compte à l'autre.

## Consignes permanentes de Krystofia
- Répondre en **français**.
- **Krystofia décide.** Ne jamais valider un trade à sa place, ne jamais lui dire de trader ou de ne pas trader une règle. On présente les faits, elle choisit. Je ne suis pas conseiller financier.
- Ne pas parler de « démo » (elle a demandé d'arrêter).
- Lire `docs/BRIEF-SEANCE-QUIZ.md` au début d'une séance ; **ne jamais lire `HANDOFF.md` en entier**.
- Simulation seulement : aucun ordre réel.

## Le projet
Méthode stricte de Krystofia sur US100, M15 (contexte H4), simulée sur des données M1 (2011–2026). Dossier : `ict-fvg-bot` (documents dans `docs/`, code dans `scripts/comboFvgV6/`, moteur `lib/krysBacktestC.js`).

## La règle F2 (achats seulement), figée
- Un balayage : une mèche passe sous le plus bas des 6 dernières barres H4 complètes (barres alignées sur minuit New York). Le FVG d'achat se forme au plus 32 bougies M15 après.
- Fenêtre 06–16 heure de New York ; âge du FVG d'entrée ≤ 8 bougies ; entrée à 50 % de la zone ; stop = bas de c1 − 3 points.
- TP = le plus éloigné de la moitié du FVG cible et de 3 R. Spread 0,6 (mises à l'échelle selon le prix annuel / 8 200). Sortie au temps à 96 bougies. Si le stop et le TP sont touchés sur la même bougie, le stop gagne.
- Référence « F2C » (série continue), 2011–2022 : 1 222 trades, +0,106 R par trade (t 2,04), 129,7 R au total, pire baisse 27,4 R. 2023–2025 : +0,171 R (déjà lu, donc plus vierge pour F2). 2026 : −0,239 R sur 87 trades (descriptif).

## Le protocole (à ne pas casser)
1. Écrire un **pré-enregistrement** (règle, critères, divulgations), calculer son SHA-256 et l'heure de New York, et l'enregistrer dans le dossier **avant tout calcul**.
2. Juger sur **2011–2022** (moitié A 2011–2016, moitié B 2017–2022).
3. Lire **2023–2025 une seule fois**, seulement pour les variantes qui passent. 2026 : descriptif.
4. **Aucune variante voisine** après un rejet.
5. Critères habituels : gain ≥ +0,03 R, test t (Welch ou apparié) ≥ 1,96, les deux moitiés > F2C et > 0, pire baisse ≤ 1,25 × celle de F2C (34,3 R), rythme ≥ 1,0 trade par semaine (1,5 pour les études de TP), le rythme comptant 2023–2025 sans lire le R.
6. Tests unitaires pour chaque script ; les résultats sont écrits dans `docs/RESULTAT-*.md`.

## Ce qui a été testé et rejeté (sur F2)
Heure et jour, TP variables, stops variables, break-even, equal lows H4 (E1), premier setup de la journée (PS1), direction du matin (D930, D06), premium/discount (PD1), ajout des ventes en miroir (F2S), plancher de RR de 5 et de 6 (RR5, RR6), premier FVG après le balayage H4 (FB1).
Cas les plus proches :
- **RR6** (TP = max(½ cible, 6 R)) : +0,160 R, t apparié 1,97, A +0,121 / B +0,201, pire baisse 44,4 (limite 34,3) → rejeté sur la baisse uniquement.
- **RR5** : +0,141 R, t 1,70, pire baisse 39,8 → rejeté.
- **FB1** (seul le premier FVG d'achat de l'épisode de balayage) : 571 trades, +0,192 R, A +0,129 / B +0,255, pire baisse 22,5, rythme 1,10 ; t de Welch 1,06 (il faut 1,96) → rejeté sur le test statistique uniquement. 2023–2025 non lu pour RR5, RR6 et FB1.

## Tri à l'aveugle (Krystofia contre F2)
8 lots de 10 signaux de F2 jugés à l'aveugle (prix relatifs, sans dates). Résultat agrégé : les signaux qu'elle prend (28) font −0,28 R en moyenne, ceux qu'elle saute (51) +0,35 R ; différence −0,63 R, intervalle à 95 % [−1,39 ; +0,16]. Aucune trace d'un avantage de son tri sur les achats de F2, mais l'essai ne mesure pas son trading réel (ventes, entrées plus tôt, stops plus courts, sorties à la main).

## Ses idées non encore traduites
- Premier setup de la journée, entrer plus tôt (elle l'a défini comme « le premier FVG après le balayage H4 » : testé, FB1), cibles de 5–6 R (testé : RR5, RR6).
- Critères mesurables qu'elle cite mais qui n'ont pas de règle écrite : stop trop loin par rapport à la volatilité, FVG H4 contre le trade, sens du jour. Chacun demanderait sa définition précise et son pré-enregistrement.
- Plafond de perte de 40 $ par trade, suivi sur ses 100 prochains trades (`docs/PREREG-PLAFOND-PERTE-40.md`) : en attente de sa date de départ et de l'export de ses trades.
- F2 sur US500 : proposé, non choisi.

## Comparaison de ses trades réels de 2025 avec F2 (descriptif, `docs/RESULTAT-COMPARAISON-TES-TRADES-VS-F2.md`)
- Sur ses 646 trades (mars–juillet 2025), seuls 32 (5 %) coïncident avec un ordre de F2 dans la même zone et au même moment ; 18 % sont hors de la fenêtre 06–16 NY. Son trading de 2025 et F2 sont deux méthodes différentes.
- Sur les 36 trades d'achat de F2 de la période, elle en a pris 15 (R de F2 +2,05, 11 TP sur 15) et laissé 21 (R de F2 −0,14, 3 TP sur 21). Analysé après coup, petit échantillon, une seule période ; le tri à l'aveugle 2011–2022 donnait l'inverse. Non démontré.
- Test propre proposé, pas encore lancé : tableau prospectif où elle note « je prends / je saute » sur chaque signal de F2 avant le résultat, avec F2 à 3 R, F2 à 6 R et FB1 côte à côte.

## Idée en cours quand le compte a changé : tendance daily au lieu de H4
Krystofia a demandé : « et si pour la tendance on regarde daily au lieu de H4, comme ça on peut chercher des buy plusieurs jours l'un après l'autre ». **Rien n'est défini ni calculé.** Trois questions étaient posées, elle n'a pas répondu (elle a changé de compte) : (1) la daily remplace-t-elle le balayage H4 (bas des N dernières barres daily) ou sert-elle de filtre de tendance en plus (et comment la reconnaît-elle) ; (2) N = 5, 10 ou 20 barres daily ; (3) fenêtre d'achat après le balayage : 3 jours, 5 jours ou 32 bougies comme F2. Il faut ses réponses, puis un pré-enregistrement écrit avant tout calcul. Barres daily alignées sur minuit NY, comme les barres H4.

## En attente de sa décision
Suivi en réel après le 21/09/2026 : noter, pour chaque signal, ce que donnent F2 à 3 R, F2 à 6 R et FB1 côte à côte (le seul moyen de trancher avec des données neuves). Elle n'a pas encore choisi. Elle a aussi demandé si elle pouvait trader F2 en mode « plancher 6 R » : réponse donnée (gain plus élevé, pire baisse plus de 60 % plus haute, décision à elle, pas de conseil financier).
