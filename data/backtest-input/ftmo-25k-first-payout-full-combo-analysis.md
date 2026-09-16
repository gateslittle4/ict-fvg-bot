# FTMO 1-Step $25k -> premier retrait de $500, combo actuel de production (2026-09-16)

Esdras : "Mon objectif now est de faire un retrait de 500$, donne moi un plan detaille... et mes chances de le faire." Même méthode que le script du 12 septembre (voir HANDOFF.md), refaite avec le combo RÉEL d'aujourd'hui (6 mécanismes, historique CSV étendu à 15-17 ans) et 293 points de départ espacés de 21 jours plutôt que 30 (plus dense, plus de résolution statistique).

### Combo actuel (Weekly Sweep GER40+US500, Breaker Block GER40 inclus)

- 293 points de départ testés, 291 ont atteint $500 dans les données disponibles (2 censurés - pas assez de données restantes, pas des échecs).
- Médiane : **79 jours**, moyenne : 128 jours
- Rachats de challenge moyens avant le premier retrait : 0.41 (coût moyen ≈ $323 en frais de challenge cumulés)

| Seuil | % des points de départ qui y arrivent |
|---|---|
| 30j | 8% |
| 45j | 21% |
| 60j | 31% |
| 90j | 56% |
| 120j | 70% |
| 180j | 82% |
| 270j | 88% |
| 365j | 92% |

### Combo prudent (retire Weekly Sweep/US500 et Breaker Block/GER40)

- 293 points de départ testés, 290 ont atteint $500 dans les données disponibles (3 censurés - pas assez de données restantes, pas des échecs).
- Médiane : **96 jours**, moyenne : 187 jours
- Rachats de challenge moyens avant le premier retrait : 0.43 (coût moyen ≈ $328 en frais de challenge cumulés)

| Seuil | % des points de départ qui y arrivent |
|---|---|
| 30j | 5% |
| 45j | 16% |
| 60j | 27% |
| 90j | 47% |
| 120j | 58% |
| 180j | 68% |
| 270j | 76% |
| 365j | 82% |

## Verdict

Comparaison directe : combo actuel médiane 79j vs combo prudent 96j. Le combo actuel reste plus rapide malgré le risque de bust journalier plus élevé - le volume de trades supplémentaire compense en pratique sur les points de départ testés. Rien codé dans `src/` - recherche/planification seulement.