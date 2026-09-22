# FVG seul : coûts réels (swap mesuré) et contrôle du biais de sélection

Suite de `fvg-only-ftmo-risk-2026.md`. Même méthode (vrai `LiveStrategyEngine`, `data/real-m1-full` reconstruit en M15, règlement M1 exact, rejeu dans le vrai `GuardrailEngine`, cycles FTMO 1-Step réels), avec en plus le **swap réel du broker** relevé le 2026-09-22 sur `/admin/swap-check` (pips/lot/jour, 21:00 UTC, triple vendredi indices / mercredi or et EURUSD, rien le week-end). Taille du pip déduite (indices 0,1 ; or 0,01 ; EURUSD 0,0001 : seule lecture plausible, voir en-tête du script). Taux d'aujourd'hui appliqués à tout l'historique : coût passé plutôt sous-estimé (taux USD plus hauts en 2023-2024).

| Paire | Achat (pips/lot/jour) | Vente | ≈ %/an à l'achat | ≈ %/an à la vente |
|---|---|---|---|---|
| US100 | -43.7 | 18.4 | -5.19 % | +2.18 % |
| US500 | -11 | 4.4 | -5.17 % | +2.07 % |
| XAUUSD | -63.88 | 39.45 | -5.35 % | +3.30 % |
| EURUSD | -0.65 | 0.28 | -2.07 % | +0.89 % |

## 1. Contrôle du biais de sélection : chaque mécanisme SEUL, sur l'entraînement SEUL (< 2025), swap réel inclus

| Mécanisme | Trades | R net | R/trade | t |
|---|---|---|---|---|
| nwog | 19 | +3.4 | +0.177 | 0.31 |
| fvg | 474 | +69.2 | +0.146 | 1.35 |
| divergence | 216 | +23.8 | +0.110 | 0.90 |
| silverbullet | 389 | -6.7 | -0.017 | -0.19 |
| judaswing | 233 | -6.3 | -0.027 | -0.23 |
| weeklysweep | 87 | -4.0 | -0.046 | -0.19 |
| cbdr | 142 | -22.6 | -0.159 | -1.11 |

Premier par R/trade : **nwog** ; premier par R total : **fvg**.

## 2. Effet du swap réel (R, rejoué dans le garde-fou du bot)

| Variante | Fenêtre | Trades | Nuits moyennes | R/trade sans swap | R/trade avec swap | R net avec swap | t avec swap |
|---|---|---|---|---|---|---|---|
| A. Combo actuel | Entraînement (< 2025) | 1141 | 0.39 | +0.079 | +0.059 | +67.7 | 0.99 |
| A. Combo actuel | Test (2025) | 528 | 0.42 | +0.171 | +0.158 | +83.2 | 1.71 |
| A. Combo actuel | 2026 | 402 | 0.34 | +0.117 | +0.109 | +44.0 | 1.05 |
| A. Combo actuel | Hors échantillon (2025 + 2026) | 930 | 0.39 | +0.148 | +0.137 | +127.2 | 1.98 |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | 474 | 0.49 | +0.172 | +0.146 | +69.2 | 1.35 |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | 211 | 0.32 | +0.411 | +0.401 | +84.6 | 2.30 |
| B. FVG seul (US100/US500/XAUUSD) | 2026 | 161 | 0.27 | +0.167 | +0.165 | +26.5 | 0.88 |
| B. FVG seul (US100/US500/XAUUSD) | Hors échantillon (2025 + 2026) | 372 | 0.30 | +0.305 | +0.299 | +111.1 | 2.34 |
| C. FVG seul sans US500 (US100/XAUUSD) | Entraînement (< 2025) | 378 | 0.58 | +0.295 | +0.266 | +100.7 | 2.14 |
| C. FVG seul sans US500 (US100/XAUUSD) | Test (2025) | 164 | 0.38 | +0.399 | +0.383 | +62.9 | 1.96 |
| C. FVG seul sans US500 (US100/XAUUSD) | 2026 | 122 | 0.32 | +0.326 | +0.324 | +39.6 | 1.47 |
| C. FVG seul sans US500 (US100/XAUUSD) | Hors échantillon (2025 + 2026) | 286 | 0.35 | +0.368 | +0.358 | +102.5 | 2.45 |

### Swap moyen par trade et par paire (variante C, tout l'historique)

| Paire | Trades | Swap moyen (R) | Nuits moyennes |
|---|---|---|---|
| US100 | 551 | -0.011 | 0.11 |
| XAUUSD | 181 | -0.043 | 1.62 |

## 3. FTMO 1-Step avec swap réel

| Variante | Fenêtre | Risque | Compte continu | Pire baisse | FTMO réussis / ratés / en cours |
|---|---|---|---|---|---|
| A. Combo actuel | Entraînement (< 2025) | 0.5 % | +32.3 % | 17.8 % | 8 / 8 / 1 (-5.6 %) |
| A. Combo actuel | Entraînement (< 2025) | 0.75 % | +45.8 % | 25.8 % | 13 / 18 / 1 (-2.3 %) |
| A. Combo actuel | Entraînement (< 2025) | 1 % | +95.1 % | 30.5 % | 21 / 25 / 1 (-5.4 %) |
| A. Combo actuel | Test (2025) | 0.5 % | +47.2 % | 17.4 % | 4 / 2 / 1 (+6.7 %) |
| A. Combo actuel | Test (2025) | 0.75 % | +74.8 % | 25.1 % | 9 / 8 / 1 (+0.6 %) |
| A. Combo actuel | Test (2025) | 1 % | +87.9 % | 30.7 % | 14 / 11 / 1 (-2.3 %) |
| A. Combo actuel | 2026 | 0.5 % | +21.9 % | 15.3 % | 3 / 2 / 1 (+4.9 %) |
| A. Combo actuel | 2026 | 0.75 % | +32.5 % | 22.1 % | 5 / 4 / 1 (+3.2 %) |
| A. Combo actuel | 2026 | 1 % | +53.2 % | 28.7 % | 8 / 8 / 1 (-1.5 %) |
| A. Combo actuel | Hors échantillon (2025 + 2026) | 0.5 % | +79.5 % | 17.4 % | 8 / 4 / 1 (+4.9 %) |
| A. Combo actuel | Hors échantillon (2025 + 2026) | 0.75 % | +131.6 % | 25.1 % | 14 / 12 / 1 (+3.2 %) |
| A. Combo actuel | Hors échantillon (2025 + 2026) | 1 % | +187.9 % | 30.7 % | 22 / 19 / 1 (-1.5 %) |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | 0.5 % | +36.8 % | 13.1 % | 4 / 1 / 1 (-1.8 %) |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | 0.75 % | +56.2 % | 19.3 % | 9 / 6 / 1 (-4.1 %) |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | 1 % | +94.9 % | 21.2 % | 13 / 8 / 1 (-8.7 %) |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | 0.5 % | +50.0 % | 10.5 % | 4 / 1 / 1 (+2.4 %) |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | 0.75 % | +81.5 % | 15.4 % | 8 / 4 / 1 (-1.4 %) |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | 1 % | +102.0 % | 18.4 % | 10 / 5 / 1 (+1.5 %) |
| B. FVG seul (US100/US500/XAUUSD) | 2026 | 0.5 % | +12.9 % | 10.0 % | 2 / 1 / 0 (+0.0 %) |
| B. FVG seul (US100/US500/XAUUSD) | 2026 | 0.75 % | +19.0 % | 14.8 % | 4 / 2 / 1 (-5.2 %) |
| B. FVG seul (US100/US500/XAUUSD) | 2026 | 1 % | +25.4 % | 16.9 % | 5 / 4 / 1 (-7.0 %) |
| B. FVG seul (US100/US500/XAUUSD) | Hors échantillon (2025 + 2026) | 0.5 % | +69.4 % | 10.5 % | 6 / 2 / 0 (+0.0 %) |
| B. FVG seul (US100/US500/XAUUSD) | Hors échantillon (2025 + 2026) | 0.75 % | +116.0 % | 15.4 % | 12 / 6 / 1 (-5.2 %) |
| B. FVG seul (US100/US500/XAUUSD) | Hors échantillon (2025 + 2026) | 1 % | +153.2 % | 19.6 % | 15 / 9 / 1 (-7.0 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Entraînement (< 2025) | 0.5 % | +61.0 % | 9.9 % | 5 / 0 / 1 (-5.6 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Entraînement (< 2025) | 0.75 % | +100.1 % | 14.7 % | 8 / 3 / 1 (-0.8 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Entraînement (< 2025) | 1 % | +134.8 % | 18.4 % | 11 / 6 / 1 (-4.5 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Test (2025) | 0.5 % | +35.2 % | 7.6 % | 3 / 0 / 1 (-1.8 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Test (2025) | 0.75 % | +55.7 % | 11.3 % | 5 / 1 / 1 (-2.7 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Test (2025) | 1 % | +67.7 % | 14.1 % | 9 / 4 / 1 (-0.9 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | 2026 | 0.5 % | +20.8 % | 5.3 % | 2 / 0 / 1 (-1.6 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | 2026 | 0.75 % | +31.9 % | 7.8 % | 3 / 0 / 1 (-2.7 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | 2026 | 1 % | +39.3 % | 10.3 % | 4 / 1 / 1 (+1.6 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Hors échantillon (2025 + 2026) | 0.5 % | +63.3 % | 7.6 % | 5 / 0 / 1 (-2.5 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Hors échantillon (2025 + 2026) | 0.75 % | +105.3 % | 11.3 % | 8 / 1 / 1 (-6.7 %) |
| C. FVG seul sans US500 (US100/XAUUSD) | Hors échantillon (2025 + 2026) | 1 % | +133.6 % | 14.1 % | 12 / 5 / 1 (+1.6 %) |
