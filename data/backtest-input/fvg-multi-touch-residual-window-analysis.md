# US100 multi-contact — les heures EN PLUS de 8h-12h (hors 10h-11h) sont-elles un vrai edge ou juste de la dilution ?

8h-12h a une espérance totale plus faible que 10h-11h seul (voir fvg-multi-touch-window-weekday-analysis.md), mais ça ne dit pas si les heures ajoutées (8h-10h + 11h-12h) sont elles-mêmes rentables ou si elles diluent juste un bon créneau avec du bruit. Ce script isole le RÉSIDU : chaque trade multi-contact dont l'entrée tombe dans 8h-12h mais PAS dans 10h-11h (identifié par correspondance d'horodatage d'entrée entre les deux moteurs).

| Période | Segment | Trades | Espérance (R) | R total | Drawdown max (R) | Verdict |
|---|---|---|---|---|---|---|
| Train (2019-2023) | 10h-11h (déjà connu) | 180 | 1.10 | 198.45 | 10.86 | — |
| Train (2019-2023) | **Résiduel (8-10h + 11-12h)** | 319 | 0.67 | 214.68 | 10.83 | — |
| Test (2024-2025) | 10h-11h (déjà connu) | 93 | 1.40 | 130.65 | 6.82 | — |
| Test (2024-2025) | **Résiduel (8-10h + 11-12h)** | 139 | 1.09 | 150.87 | 8.58 | — |

**Verdict sur le résidu seul** : ✅ tient. Les heures ajoutées par 8h-12h ne sont PAS du pur bruit - elles ont leur propre espérance positive des deux côtés (0.67R train, 1.09R test), juste plus faible que le cœur 10h-11h (1.10R train). Élargir la fenêtre ajoute un vrai deuxième edge, plus faible mais réel, pas seulement de la dilution.