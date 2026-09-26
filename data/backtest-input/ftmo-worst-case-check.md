# Challenge FTMO : pertes latentes comprises

Critique externe (Gemini, 25/09/2026) : FTMO mesure l'équité (positions ouvertes comprises), la simulation ne comptait que le solde réalisé. Trois mesures : **solde réalisé** (l'ancienne) ; **pire perte réelle** : chaque position compte, de son entrée à sa sortie, pour la pire perte qu'elle a vraiment atteinte (mesurée minute par minute au rejeu) - encore prudent, puisque toutes les pires pertes sont supposées en même temps ; **tout au stop** : pire cas, chaque position ouverte à −1 R. Départ chaque lundi. Script : `scripts/runFtmoWorstCaseCheck.js`.

## Bot complet (combo + A + B), rejeu fidèle

8619 trades. Positions ouvertes en même temps : au plus 3 ; part du temps avec 0 / 1 / 2 / 3+ : 65 % / 30 % / 5 % / 0 %.

### Risque 0.5 % par trade (cible et perte max 20 R, perte du jour 6 R)

| Départs | Nombre | Réussis : solde réalisé / pire perte réelle / tout au stop | Bustés (perte max + jour) | Durée médiane des réussites |
|---|---|---|---|---|
| 2011-2016 | 313 | 45 % / 44 % / 43 % | 55 % / 56 % / 57 % | 59 j / 60 j / 59 j |
| 2017-2022 | 313 | 58 % / 58 % / 57 % | 42 % / 42 % / 43 % | 50 j / 50 j / 50 j |
| 2023-2025 | 157 | 61 % / 61 % / 50 % | 39 % / 39 % / 50 % | 61 j / 61 j / 52 j |
| 2026 (→ 21/09) | 33 | 21 % / 18 % / 18 % | 58 % / 61 % / 61 % | 37 j / 40 j / 40 j |
| Tout 2011-2026 | 816 | 52 % / 52 % / 48 % | 47 % / 47 % / 51 % | 53 j / 53 j / 51 j |

### Risque 0.4 % par trade (cible et perte max 25 R, perte du jour 7.5 R)

| Départs | Nombre | Réussis : solde réalisé / pire perte réelle / tout au stop | Bustés (perte max + jour) | Durée médiane des réussites |
|---|---|---|---|---|
| 2011-2016 | 313 | 50 % / 49 % / 49 % | 50 % / 51 % / 51 % | 81 j / 82 j / 82 j |
| 2017-2022 | 313 | 61 % / 61 % / 61 % | 39 % / 39 % / 39 % | 64 j / 64 j / 64 j |
| 2023-2025 | 157 | 61 % / 61 % / 57 % | 39 % / 39 % / 43 % | 93 j / 93 j / 88 j |
| 2026 (→ 21/09) | 33 | 12 % / 6 % / 6 % | 64 % / 70 % / 70 % | 54 j / 46 j / 46 j |
| Tout 2011-2026 | 816 | 55 % / 54 % / 53 % | 44 % / 45 % / 46 % | 74 j / 75 j / 74 j |

### Risque 0.3 % par trade (cible et perte max 33 R, perte du jour 10 R)

| Départs | Nombre | Réussis : solde réalisé / pire perte réelle / tout au stop | Bustés (perte max + jour) | Durée médiane des réussites |
|---|---|---|---|---|
| 2011-2016 | 313 | 45 % / 45 % / 45 % | 55 % / 55 % / 55 % | 114 j / 114 j / 114 j |
| 2017-2022 | 313 | 86 % / 86 % / 86 % | 14 % / 14 % / 14 % | 112 j / 113 j / 113 j |
| 2023-2025 | 157 | 87 % / 87 % / 87 % | 13 % / 13 % / 13 % | 192 j / 192 j / 192 j |
| 2026 (→ 21/09) | 33 | 0 % / 0 % / 0 % | 9 % / 9 % / 9 % | NaN j / NaN j / NaN j |
| Tout 2011-2026 | 816 | 67 % / 67 % / 67 % | 29 % / 29 % / 29 % | 122 j / 123 j / 123 j |

## Combo seul (tranches sans A/B)

5058 trades. Positions ouvertes en même temps : au plus 3 ; part du temps avec 0 / 1 / 2 / 3+ : 59 % / 35 % / 6 % / 0 %.

### Risque 0.5 % par trade (cible et perte max 20 R, perte du jour 6 R)

| Départs | Nombre | Réussis : solde réalisé / tout au stop | Bustés (perte max + jour) | Durée médiane des réussites |
|---|---|---|---|---|
| 2011-2016 | 313 | 49 % / 37 % | 51 % / 63 % | 120 j / 93 j |
| 2017-2022 | 313 | 77 % / 71 % | 23 % / 29 % | 75 j / 71 j |
| 2023-2025 | 157 | 42 % / 33 % | 58 % / 67 % | 93 j / 67 j |
| 2026 (→ 21/09) | 33 | 33 % / 33 % | 12 % / 12 % | 49 j / 53 j |
| Tout 2011-2026 | 816 | 57 % / 49 % | 40 % / 49 % | 86 j / 74 j |

### Risque 0.4 % par trade (cible et perte max 25 R, perte du jour 7.5 R)

| Départs | Nombre | Réussis : solde réalisé / tout au stop | Bustés (perte max + jour) | Durée médiane des réussites |
|---|---|---|---|---|
| 2011-2016 | 313 | 48 % / 47 % | 52 % / 53 % | 172 j / 175 j |
| 2017-2022 | 313 | 81 % / 80 % | 19 % / 20 % | 100 j / 102 j |
| 2023-2025 | 157 | 37 % / 37 % | 63 % / 63 % | 163 j / 163 j |
| 2026 (→ 21/09) | 33 | 24 % / 24 % | 9 % / 9 % | 144 j / 144 j |
| Tout 2011-2026 | 816 | 57 % / 57 % | 40 % / 40 % | 131 j / 134 j |

### Risque 0.3 % par trade (cible et perte max 33 R, perte du jour 10 R)

| Départs | Nombre | Réussis : solde réalisé / tout au stop | Bustés (perte max + jour) | Durée médiane des réussites |
|---|---|---|---|---|
| 2011-2016 | 313 | 52 % / 51 % | 48 % / 49 % | 268 j / 269 j |
| 2017-2022 | 313 | 89 % / 89 % | 11 % / 11 % | 190 j / 191 j |
| 2023-2025 | 157 | 31 % / 31 % | 69 % / 69 % | 197 j / 197 j |
| 2026 (→ 21/09) | 33 | 6 % / 6 % | 9 % / 9 % | 191 j / 191 j |
| Tout 2011-2026 | 816 | 60 % / 60 % | 36 % / 37 % | 212 j / 212 j |

## Lecture

- **Les pertes latentes changent peu le résultat** pour ce bot : chaque trade a un stop posé (une position ne peut pas perdre plus
  d'environ 1 R en cours de route, sauf trou de cotation), il y a au plus 3 positions ouvertes et 2 seulement ~5 % du temps, et les
  trades gagnants ne descendent en moyenne qu'à −0,35 R avant de gagner (11 % descendent sous −0,8 R). Bot complet à 0,5 % :
  52 % de réussite en solde réalisé, 52 % avec la pire perte réelle, 48 % dans le pire cas. La limite journalière (3 %) n'est presque
  jamais la cause d'un échec : c'est la perte maximale suiveuse.
- Correctif : un premier calcul « tout au stop » donnait 40 % pour le combo seul ; c'était une erreur d'arrondi (la somme des pertes
  latentes ne revenait pas exactement à zéro, ce qui empêchait de valider la réussite). Chiffre corrigé : 49 %.
- Le bot complet (avec A, cible 10 R, 23 % de gagnants) gagne plus de R que le combo seul mais varie davantage : à 0,5 % il réussit
  moins souvent en 2017-2022 (58 % contre 77 %) ; à 0,3 % il réussit 67 % des départs 2011-2026 (médiane 4 mois). Observation
  descriptive, pas un test pré-enregistré.
