# Résultat : F2 gelée sur d'autres instruments (GER40, XAUUSD ; US500, US100 en descriptif)

Définitions : `PREREG-F2-AUTRES-INSTRUMENTS.md` (SHA-256 `9222a76a…64`, écrit le 2026-10-10, commité avant tout calcul). Calculé le 2026-11-14 (soir, heure de New York). Code : `scripts/comboFvgV6/comboAN_autres_instruments.mjs` (script pré-enregistré, lancé avec le contrôle HistData) et `comboAN_sans_histdata.mjs` (même étude, lancée d'abord sans HistData avec un contrôle de remplacement : les 296 trades US100 2024-2026 redonnés trade pour trade contre `DONNEES-F2-ML.csv`). Les deux lancements donnent les mêmes chiffres pour GER40, XAUUSD et US500 2023-2026. Sorties : `SORTIE-F2-AUTRES-INSTRUMENTS.txt`, `SORTIE-F2-AUTRES-INSTRUMENTS-SANS-HISTDATA.txt`.

## Verdict (pré-enregistré) : NON RÉPLIQUÉE

Série poolée GER40 + XAUUSD, 2023-01-01 → 2026-09-21 :

| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| Poolé GER40 + XAUUSD | 838 | 26 % | −3,3 | **−0,004** | −0,07 | 38,8 |
| dont 2023-2024 | 433 | 25 % | −28,2 | −0,065 | −0,81 | 43,9 |
| dont 2025-2026 | 405 | 28 % | +24,9 | +0,061 | +0,69 | 31,7 |
| GER40 seul | 446 | 26 % | −0,9 | −0,002 | −0,02 | 35,1 |
| XAUUSD seul | 392 | 27 % | −2,4 | −0,006 | −0,07 | 31,0 |

R moyen poolé ≤ 0 → le dernier niveau du verdict s'applique. Les quatre conditions de « répliquée » : 1 (R > 0, t ≥ 1,96) non ; 2 (deux périodes positives) non, 2023-2024 est négative ; 3 (chaque instrument ≥ 0) non ; 4 (contrôle) oui.

Par an : GER40 2023 −0,14 (125), 2024 −0,06 (108), 2025 +0,34 (129), 2026 −0,24 (84). XAUUSD 2023 −0,00 (106), 2024 −0,04 (94), 2025 +0,28 (108), 2026 −0,35 (84). Rythme : 2,31 (GER40) et 2,02 (XAUUSD) trades par semaine.

## Descriptif (non jugé)

US500, série continue HistData + broker (script officiel) : 2011-2016 584 trades, +0,045 R ; 2017-2022 542 trades, +0,143 R (t 1,86) ; **2023-2026 383 trades, 23 % gagnants, −40,2 R, −0,105 R, t −1,23, pire baisse 52,4**. 184 de ses 383 ordres sont posés à la même bougie qu'un ordre US100 (fort recouvrement, comme attendu). Sur le broker seul (2e script) : 380 trades, −0,099 R (2023 +0,09 ; 2024 −0,35 ; 2025 −0,01 ; 2026 −0,10). Note : sur US500, F2 était positive de 2011 à 2022 (comme sur US100) puis négative depuis 2023 ; les deux indices sont très corrélés, ce n'est pas un échantillon indépendant.

US100 2023-2026 (référence, série continue) : 418 trades, 27 %, +35,7 R, +0,085 R, t 0,94 ; broker seul : 412 trades, +0,094 R (2023 +0,30 ; 2024 −0,08 ; 2025 +0,35 ; 2026 −0,24).

Sensibilité aux coûts, 2023-2026 (R moyen par trade) :

| | Spread du projet | Spread nul | Spread ×2 | Achats sans filtre de balayage |
|---|---|---|---|---|
| GER40 | −0,002 | +0,045 | −0,071 | +0,048 (1 032 trades) |
| XAUUSD | −0,006 | +0,019 | −0,066 | +0,018 (1 070) |
| US500 (série continue) | −0,105 | −0,049 | −0,147 | −0,117 (1 147) |
| US100 (série continue) | +0,085 | +0,125 | +0,044 | +0,029 (1 232) |

## Ce que cela dit
- Sur GER40 et XAUUSD, F2 est **indiscernable de zéro avant coûts et légèrement négative avec le spread du projet**. Sur US500, elle est négative. L'avantage de +0,1 R par trade mesuré sur US100 ne se retrouve nulle part ailleurs.
- **Le filtre de balayage H4 n'ajoute rien hors US100** : sans lui, GER40 et XAUUSD font même un peu mieux (+0,05 et +0,02) avec deux fois plus de trades. Sur US100, le filtre faisait passer de +0,04 à +0,09 : c'est l'ingrédient qui portait F2, et il ne se transporte pas.
- Le profil annuel est le même partout : 2025 bonne (+0,28 à +0,35 sur les quatre instruments), 2024 et 2026 mauvaises. F2 suit donc d'abord le **régime de marché**, pas une propriété de l'instrument.
- Chaque doublement du spread coûte environ 0,06 à 0,07 R par trade : à ce niveau d'avantage, les coûts réels du broker décident du signe.

## Ce que cela ne dit pas
- Ce n'est pas la preuve que F2 ne vaut rien sur US100 : la puissance est faible (≈ 40 % de chances de passer t ≥ 1,96 si le vrai R était +0,106) et la fenêtre 06-16 h New York n'est pas la séance active de GER40 ni de l'or (divulgué d'avance).
- Mais l'interprétation la plus simple est maintenant : **F2 sur US100 = marché haussier du NAS + un peu de hasard de sélection**, pas un avantage structurel du setup.

## Interdit après lecture
Aucune adaptation d'heure, de coût, de marge ou de filtre pour ces instruments. Un autre instrument ou une autre fenêtre horaire demande un nouveau pré-enregistrement et compte comme un essai de plus. Simulation seulement ; aucune décision de trade n'est prise ici ; Krystofia décide.
