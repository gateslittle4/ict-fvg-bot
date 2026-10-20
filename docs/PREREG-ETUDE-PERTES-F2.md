# Définitions — étude des pertes de F2 (2011–2022)

Écrit le 2026-10-06, AVANT tout calcul de cette étude. **Descriptif seulement** : aucun critère de réussite, aucune règle jugée, F2 inchangée. Fait suite à `ANALYSE-STOPS-F2.md` (qui montrait le comportement du prix après le stop, sans point de comparaison) et à `RESULTAT-ETUDE-PERTES-2025.md` (tes pertes réelles).

## Ce qui est déjà connu (pas refait)
Composition des trades (≈ 71 % de stops, 4 % de sorties au temps), part des stops où le prix repart ensuite vers le TP, profil des stops (durée, même bougie). Voir `ANALYSE-STOPS-F2.md`.

## Ce qui est nouveau ici
1. **Avancée favorable maximale (AFM) avant le stop** : comme dans ton étude, de la bougie de remplissage à celle de sortie, plus grand mouvement dans le sens du trade à partir de l'entrée, en multiples du risque (R). Catégories : moins de 0,25 R, de 0,25 à 1 R, 1 R ou plus.
2. **Gagnants qui ont failli être stoppés** : pour les gagnants, plus grande avancée contre le trade (en R) avant le TP : parts au-dessus de 0,5 R et de 0,75 R.
3. **Taille du stop relative au bruit du marché** : S = risque (en points) / amplitude moyenne des 96 bougies M15 qui précèdent la bougie de remplissage (une journée de bougies M15). Quatre groupes de S de même effectif (quartiles) : nombre de trades, part de gagnants, R moyen avec son IC à 95 % (bootstrap, graine fixe). Aucun test d'hypothèse : c'est le même regard que dans ton étude, où tes stops étaient passés de 23–25 à 10–15 points.
4. **Après le stop, avec point de comparaison** : pour chaque trade stoppé (sortie « stop »), dans les 96 bougies M15 suivantes (1 jour), le prix atteint-il le niveau d'entrée ? le niveau du TP prévu ? Base de comparaison : pour chaque stop, 20 bougies M15 tirées au hasard (graine fixe) entre 06:00 et 16:00 NY, un jour de bourse de la même année, avec le même R et le même RR prévu ; on mesure si le prix atteint, dans les 96 bougies suivantes, +R puis +(1 + RR) × R depuis l'ouverture de la bougie tirée. Intervalles de Wilson à 95 % pour les parts observées. C'est ce qui manquait dans `ANALYSE-STOPS-F2.md`.
5. **Taille des pertes** : tous les stops valent −1 R par construction ; on note seulement la part des sorties au temps (perte de moins de 1 R) pour mémoire.

## Données
F2 sur la série continue (`krysBacktestC.js`, balayage H4, FVG d'entrée ≤ 8 bougies, 06–16 NY, entrée à 50 %, stop c1 − 3 pts, TP = max(½ cible, 3 R), spread 0,6), **2011–2022 uniquement** (1 222 trades attendus ; contrôle à retrouver : +0,106 R par trade). Le test 2023–2025 et 2026 ne sont pas lus. Les trades sont comptés par année civile, comme dans les études précédentes.

## Ce que je ne ferai pas
Pas de filtre de F2 déduit de ces tableaux : si un groupe ressort (par exemple les stops très courts), c'est une piste à écrire et à juger à part (2011–2022, puis 2023–2025 lu une fois), pas un résultat. Pas de variante voisine d'une règle déjà rejetée.

## Réserves prévues
- Quatre groupes de taille de stop, deux tableaux de catégories : plusieurs comparaisons, aucune n'est un test ; les intervalles servent à voir ce qui est dans le bruit.
- Les trades de F2 sont corrélés ; les intervalles sont un peu trop étroits.
- La base de comparaison ne tient pas compte de la volatilité du moment ni de la dérive haussière ; elle sert à voir si le « retour du prix » est particulier aux stops de F2.
