# Challenge FTMO : solde réalisé contre pire cas des pertes latentes

Critique externe (Gemini, 25/09/2026) : FTMO mesure l'équité (positions ouvertes comprises), la simulation ne comptait que le solde réalisé. Ici, **pire cas** : chaque position ouverte compte, de son entrée à sa sortie, comme si elle était déjà à son stop (−1 R, ou sa perte finale si elle a fini plus bas). La réalité est entre les deux colonnes. Trades du rejeu fidèle (combo sans A/B), départ chaque lundi. Script : `scripts/runFtmoWorstCaseCheck.js`.

Positions ouvertes en même temps : au plus 3 ; part du temps de marché avec 0 / 1 / 2 / 3+ positions : 59 % / 35 % / 6 % / 0 %.

## Risque 0.5 % par trade (cible 20 R, perte max 20 R, perte du jour 6 R)

| Départs | Nombre | Réussis : réalisé / pire cas | Bustés perte max : réalisé / pire cas | Bustés perte du jour : réalisé / pire cas | Durée médiane |
|---|---|---|---|---|---|
| 2011-2016 | 313 | 49 % / **28 %** | 51 % / 72 % | 0 % / 0 % | 120 j / 136 j |
| 2017-2022 | 313 | 77 % / **58 %** | 20 % / 39 % | 3 % / 3 % | 75 j / 64 j |
| 2023-2025 | 157 | 42 % / **31 %** | 58 % / 69 % | 0 % / 0 % | 93 j / 71 j |
| 2026 (→ 21/09) | 33 | 33 % / **24 %** | 6 % / 6 % | 6 % / 6 % | 49 j / 46 j |
| Tout 2011-2026 | 816 | 57 % / **40 %** | 39 % / 56 % | 1 % / 1 % | 86 j / 74 j |

## Risque 0.4 % par trade (cible 25 R, perte max 25 R, perte du jour 7.5 R)

| Départs | Nombre | Réussis : réalisé / pire cas | Bustés perte max : réalisé / pire cas | Bustés perte du jour : réalisé / pire cas | Durée médiane |
|---|---|---|---|---|---|
| 2011-2016 | 313 | 48 % / **39 %** | 52 % / 61 % | 0 % / 0 % | 172 j / 301 j |
| 2017-2022 | 313 | 81 % / **70 %** | 16 % / 26 % | 4 % / 4 % | 100 j / 100 j |
| 2023-2025 | 157 | 37 % / **37 %** | 63 % / 63 % | 0 % / 0 % | 163 j / 163 j |
| 2026 (→ 21/09) | 33 | 24 % / **15 %** | 3 % / 3 % | 6 % / 6 % | 144 j / 123 j |
| Tout 2011-2026 | 816 | 57 % / **50 %** | 38 % / 46 % | 2 % / 2 % | 131 j / 157 j |

## Risque 0.3 % par trade (cible 33.333333333333336 R, perte max 33.333333333333336 R, perte du jour 10 R)

| Départs | Nombre | Réussis : réalisé / pire cas | Bustés perte max : réalisé / pire cas | Bustés perte du jour : réalisé / pire cas | Durée médiane |
|---|---|---|---|---|---|
| 2011-2016 | 313 | 52 % / **45 %** | 48 % / 55 % | 0 % / 0 % | 268 j / 469 j |
| 2017-2022 | 313 | 89 % / **83 %** | 11 % / 17 % | 0 % / 0 % | 190 j / 201 j |
| 2023-2025 | 157 | 31 % / **31 %** | 53 % / 53 % | 17 % / 17 % | 197 j / 197 j |
| 2026 (→ 21/09) | 33 | 6 % / **0 %** | 0 % / 0 % | 9 % / 9 % | 191 j / NaN j |
| Tout 2011-2026 | 816 | 60 % / **55 %** | 33 % / 38 % | 4 % / 4 % | 212 j / 264 j |

