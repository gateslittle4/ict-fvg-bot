# Arrêt d'une stratégie si sa baisse dépasse 1,5 × sa pire baisse historique — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-kill-switch-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runKillSwitchStudy.js`. Baisse = recul du R cumulé depuis son plus haut (B en % du nominal). Jambe arrêtée définitivement dès que sa baisse dépasse 1,5 × la référence.

## 1. Référence 2010-2022, appliquée au 01/01/2023 → 21/09/2026

| Jambe | Référence (pire baisse connue au départ) | Arrêtée ? | R après l'arrêt (évité si négatif) | Total sans règle | Total avec règle |
|---|---|---|---|---|---|
| divergence US500 | 21.0 R | non | — | +18.1 R | +18.1 R |
| silverbullet US500 | 24.3 R | 2025-09-16 | -20.3 R | -37.6 R | -17.3 R |
| silverbullet US100 | 38.0 R | non | — | -18.7 R | -18.7 R |
| cbdr US100 | 42.7 R | non | — | -16.2 R | -16.2 R |
| nwog US100 | 14.0 R | non | — | +2.7 R | +2.7 R |
| divergence US100 | 47.0 R | non | — | +34.0 R | +34.0 R |
| weeklysweep US500 | 34.0 R | non | — | +21.7 R | +21.7 R |
| rsi2-daily US500 | 12.9 R | non | — | +4.2 R | +4.2 R |
| A (ORB) US100 | 57.5 R | non | — | +78.1 R | +78.1 R |
| B (noise area) US500 | 15.2 % | non | — | +10.8 % | +10.8 % |

Jambes en R réunies : sans règle +86.4 R, avec règle +106.7 R → coût ≤ 5 %.

## 2. Glissante : référence mise à jour chaque 1er janvier (départ 2010-2014), appliquée 2015 → 2026

| Jambe | Référence (pire baisse connue au départ) | Arrêtée ? | R après l'arrêt (évité si négatif) | Total sans règle | Total avec règle |
|---|---|---|---|---|---|
| divergence US500 | 20.0 R | non | — | +54.2 R | +54.2 R |
| silverbullet US500 | 19.1 R | 2025-09-16 | -20.3 R | +12.7 R | +33.0 R |
| silverbullet US100 | 21.4 R | non | — | +64.4 R | +64.4 R |
| cbdr US100 | 24.4 R | non | — | +0.6 R | +0.6 R |
| nwog US100 | 9.1 R | non | — | +53.1 R | +53.1 R |
| divergence US100 | 40.1 R | non | — | +36.6 R | +36.6 R |
| weeklysweep US500 | 32.0 R | non | — | +81.0 R | +81.0 R |
| rsi2-daily US500 | 1.9 R | 2016-12-29 | +4.7 R | -4.8 R | -9.5 R |
| A (ORB) US100 | 57.5 R | non | — | +425.5 R | +425.5 R |
| B (noise area) US500 | 5.1 % | 2016-06-22 | +49.4 % | +48.0 % | -1.4 % |

Jambes en R réunies : sans règle +723.2 R, avec règle +738.9 R → coût ≤ 5 %.

## Verdict

**GARDÉE comme filet de sécurité** (coût ≤ 5 % dans les deux évaluations).

## Limites

- Rejeu fidèle recollé par tranches ; B en % (hors total en R).
- Une jambe arrêtée pourrait libérer des places pour d'autres (position unique par paire, garde-fou) : non simulé.
