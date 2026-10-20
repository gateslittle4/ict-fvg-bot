# Résultat — Combo FVG (v6), protocole entraînement / test / forward

Calculé le 2026-10-04 avec les règles figées de `PREREG-COMBO-FVG-V6.md` (aucune retouche). Rendements en R, achats US100 M15, rejeu année par année.

| Bloc | Trades | Gagnants | Total R | R / trade | t |
|---|---|---|---|---|---|
| Entraînement A 2011–2016 | 250 | 26 % | −7,3 | −0,029 | −0,27 |
| Entraînement B 2017–2022 | 206 | 30 % | +19,0 | +0,092 | 0,73 |
| **Entraînement 2011–2022** | 456 | 27 % | +11,7 | +0,026 | 0,31 |
| dont 2011–2018 (jamais vu avant) | 315 | 26 % | −8,2 | −0,026 | −0,27 |
| Test 2023–2025 (non vierge) | 112 | 27 % | +11,1 | +0,099 | 0,56 |
| Forward 2026 jusqu'au 21/09 (non vierge) | 23 | 30 % | +2,5 | +0,109 | 0,30 |

Par année (R / trade, nombre de trades) : 2011 +0,14 (44) · 2012 +0,04 (46) · 2013 +0,11 (31) · 2014 −0,03 (27) · 2015 −0,23 (56) · 2016 −0,11 (46) · 2017 +0,93 (28) · 2018 −0,73 (37) · 2019 +0,07 (41) · 2020 +0,16 (40) · 2021 −0,07 (36) · 2022 +0,56 (24) · 2023 +0,18 (41) · 2024 −0,14 (36) · 2025 +0,25 (35) · 2026 +0,11 (23).

## Contrôles (mêmes règles, filtres retirés)
| Variante | Entraînement 2011–2022 | Test 2023–2025 | 2026 |
|---|---|---|---|
| Combo FVG v6 | +0,026 (456) | +0,099 (112) | +0,109 (23) |
| Achats sans filtre H4 | +0,025 (3 646) | +0,075 (937) | −0,089 (219) |
| Achats et ventes, sans filtre | −0,031 (6 005) | −0,050 (1 489) | −0,034 (358) |

## Verdict selon les critères écrits d'avance
1. Entraînement : ≥ 60 trades OK (456) ; t ≥ 2 ÉCHEC (0,31) ; moyenne > 0 dans A ET B ÉCHEC (A = −0,029).
2. Test 2023–2025 > 0 : OK (+0,099), mais le bloc n'est pas vierge.
3. v6 meilleure que « achats sans filtre » sur 2011–2022 : ÉCHEC (+0,026 contre +0,025, identique).

**Combo FVG v6 : NON VALIDÉE.** Sur 2011–2018, jamais regardées avant, la moyenne est légèrement négative. Le résultat de la v6 dépend surtout de quelques années (2017, 2022) et d'une année très négative (2018). Aucune preuve d'avantage statistique.

## Limites
- Rejeu M15 pessimiste (stop avant TP dans une bougie), pas de sorties à la minute : les chiffres ne sont pas strictement comparables aux +0,13 R du broker avec sorties M1.
- HistData 2010–2022 est un flux différent du broker 2023+ ; spread constant en proportion du prix, pas de glissement.
- Écart d'échelle : la v6 filtre ~12 % des achats « sans filtre » ; l'avantage éventuel est donc porté par peu de trades (t faible).
- Le vrai forward reste la démo à partir du 05/10/2026, règles figées.
