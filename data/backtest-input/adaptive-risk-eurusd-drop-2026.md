# Risque adaptatif (0,5 % -> 0,25 % à -4 % de baisse) et retrait d'EURUSD — fenêtre test/forward 2026-01-01 → aujourd'hui, M1 exact

Question d'Esdras : (1) un risque adaptatif (commencer à 0,5 %, redescendre à 0,25 % dès -4 % de baisse depuis le dernier sommet, remonter à 0,5 % au sommet suivant) aide-t-il ? (2) retirer la paire qui ne performe pas (EURUSD, seule paire nette négative en M1 exact) améliore-t-il le résultat ? Même liste canonique de trades que le rapport précédent (un seul `warmUp()` réel, réglement M1 exact). EURUSD lue sur l'entraînement (< 2026) d'abord (règle : retenue seulement si son R net y est ≤ 0), test lu une seule fois ensuite — même discipline que le retrait de GER40.

**EURUSD, R net entraînement (< 2026-01-01) : +0.5 R → NON retenue (légèrement positive, le protocole refuse de la retirer — Esdras visait EURUSD par erreur, la vraie paire négative ici est US500).**

**US500, R net entraînement (< 2026-01-01) : -50.7 R → retenue pour lecture du test.**

## Risque fixe : combo actuel vs sans EURUSD

| Combo | Risque | Compte $10k | Pire baisse | FTMO (réussis/ratés/en cours) |
|---|---|---|---|---|
| Combo actuel (4 paires) | 0.25% | +10.95% | 6.9% | 1/0/1 |
| Combo actuel (4 paires) | 0.3% | +13.14% | 8.2% | 1/0/1 |
| Combo actuel (4 paires) | 0.5% | +21.79% | 13.3% | 4/2/1 |
| Sans US500 (3 paires) | 0.25% | +9.50% | 5.1% | 1/0/1 |
| Sans US500 (3 paires) | 0.3% | +11.40% | 6.1% | 1/0/1 |
| Sans US500 (3 paires) | 0.5% | +18.97% | 10.0% | 2/0/1 |

## Risque adaptatif (haut 0,5 % / bas 0,25 % / déclenchement à -4 % de baisse)

| Combo | Compte $10k | Pire baisse | Bascules haut↔bas | FTMO (réussis/ratés/en cours) |
|---|---|---|---|---|
| Combo actuel (4 paires) | +14.98% | 8.9% | 19 | 1/0/1 |
| Sans US500 (3 paires) | +4.42% | 7.5% | 43 | 1/0/1 |

### Comparaison directe : 0,5 % fixe vs adaptatif (combo actuel)

- 0,5 % fixe : +21.79%, pire baisse 13.3%
- Adaptatif 0,5→0,25 à -4% : +14.98%, pire baisse 8.9%, 19 bascules

## Limites

- Même limites que le rapport précédent (coûts partiels, garde-fous réels mais pas de correctif de géométrie d'ordre).
- Le risque adaptatif est simulé au niveau du compte (bascule instantanée) : en réel, il faudrait surveiller la baisse et changer `RISK_PCT_PER_TRADE`/le réglage dashboard à la main (pas automatisé dans le bot aujourd'hui).
- EURUSD retirée seulement si le protocole ci-dessus le permet (voir la ligne en gras) : jamais adoptée sur un seul test, à confirmer en démo.