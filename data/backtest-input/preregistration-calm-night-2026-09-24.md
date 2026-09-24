# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Idée d'Esdras : « la nuit, le marché est calme, guidé par les algorithmes, sans manipulation ni forte poussée »

Date : 2026-09-24. Le test précédent (`preregistration-night-hypothesis-2026-09-24.md`) a montré que les stratégies ICT existantes ne gagnent pas plus la nuit. Esdras maintient son idée ; la traduction logique d'un marché calme sans fortes poussées est le **retour à la moyenne** : un écart de prix se referme au lieu de continuer. On teste donc une stratégie conçue pour ça, avec des paramètres ronds fixés ici, sans optimisation. Aucun résultat de cette règle n'a été calculé avant ce texte.

## Règle « nuit calme » (achat ; vente = miroir)
1. **Fenêtre** : heure de New York réelle. Moyenne de référence = moyenne des prix typiques (haut + bas + clôture) / 3 des barres M1 depuis **18:00** (réouverture). Contrôles toutes les 15 minutes, sur les clôtures de bougies M15, de **20:00 à 01:00** ; sortie forcée à **02:00** (avant Londres).
2. **Volatilité** : ATR(14) des bougies M15 (les 14 dernières bougies closes).
3. **Entrée** : si la clôture M15 est **≤ moyenne − 1,5 × ATR**, achat à l'ouverture de la minute suivante (à l'ask = bid + spread). Miroir : clôture ≥ moyenne + 1,5 × ATR → vente (au bid). **Un seul trade par nuit et par indice** (le premier signal).
4. **Objectif** = la moyenne au moment du signal (niveau fixe). **Stop** = 1,5 × ATR au-delà du prix d'entrée. R = distance entrée → stop.
5. Réglage minute par minute sur M1 ; stop d'abord si stop et objectif dans la même minute ; une vente sort à l'ask.
6. **Coûts** : spread par défaut du projet en % du prix du moment ; swap du broker si une échéance tombe dans le trade (normalement aucune : 20:00-02:00 ne croise pas l'échéance de 17:00 NY).

## Contrôle qui teste l'idée (obligatoire)
**La même règle en séance de New York** : moyenne depuis 9:30, contrôles de 10:00 à 15:00, sortie forcée à 16:00. L'idée d'Esdras prédit : **nuit gagnante, et nuit > séance** (en séance, les fortes poussées doivent faire perdre un pari de retour).

## Paires
Principales : **US100** et **US500** (nuit). Robustesse (affichées, jamais adoptables) : XAUUSD et EURUSD (nuit) ; toutes les paires en séance.

## Périodes (protocole du projet)
Entraînement 2010-2022 = HistData M1 ; test 2023-2025 et 2026 (→ 2026-09-21) = M1 du broker.

## Critère de succès (le même que les études précédentes)
- Jambe nuit US100 ou US500 **candidate** si, sur l'entraînement : ≥ 60 trades, R moyen net > 0 avec **t ≥ 2**, positive en 2010-2016 ET en 2017-2022 ; PUIS test 2023-2025 : ≥ 30 trades, R moyen > 0. 2026 : descriptif.
- L'**idée** d'Esdras est confirmée seulement si, en plus, l'écart nuit − séance est positif sur l'entraînement ET au test pour la jambe candidate.
- Tests multiples : 2 jambes principales très corrélées. Candidate → démo d'abord. Rien ne passe → on n'ajoute pas de filtres ni ne change les seuils.
- Limites : spread constant (relevé réel 4 jours : pas plus large la nuit) ; paramètres 1,5 × ATR / 18:00 / 02:00 choisis a priori, un seul essai.
