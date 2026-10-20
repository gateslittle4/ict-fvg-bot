# Résultat — lecture exploratoire de H1 (stop court, S ≥ 1,76) sur 2023–2025 et 2026

Lu le 2026-10-06, une seule fois, après `PREREG-F2-H1-LECTURE-EXPLORATOIRE.md` (écrit et sauvegardé avant la lecture ; SHA-256 : `5ad391569a3025962fe72fa0e490e15c3a5cc04255a73bedb08c7452eedf8895`, fichier horodaté 18:29 heure de New York). Commande : `comboT.mjs <data> test H1`.

## Verdict
**Indice défavorable. H1 est abandonnée, F2 reste telle quelle.** Le filtre, qui doublait le R moyen sur 2011–2022, ne tient pas sur les années suivantes : il l'efface, et les trades qu'il supprime étaient en moyenne meilleurs que ceux qu'il garde.

## Test 2023–2025
| | F2C | H1 (S ≥ 1,76) |
|---|---|---|
| Trades | 331 | 166 |
| Gagnants | 29 % | 28 % |
| R moyen | **+0,171** (t 1,61) | **+0,006** (t 0,05) |
| R total | 56,5 | 1,0 |
| Pire baisse (R) | 24,8 | 31,8 |

Trades supprimés par le filtre : 177, de R moyen **+0,312**. Les trades gardés : +0,006. Le critère (R de H1 > R de F2C, > 0, et supprimés moins bons que gardés) échoue sur deux des trois conditions : verdict **KO**.

## 2026 (au 21/09, descriptif)
H1 : 37 trades, R moyen −0,204 ; F2C : 87 trades, −0,239 ; trades supprimés : 55, R moyen −0,259. Les deux sont négatifs, sans différence lisible entre eux.

## Ce que ça veut dire
Sur 2011–2022, les stops courts par rapport au bruit étaient à peu près à zéro ; sur 2023–2025 c'est l'inverse : ce sont eux qui gagnent le plus (+0,312). Le motif vu sur 2011–2022 n'était donc pas une propriété stable de la méthode : c'est exactement ce qu'on attend d'un seuil choisi après avoir vu les données. L'entraînement l'avait déjà rejeté (t de Welch 1,62) ; cette lecture confirme le rejet.

## Suite
- **2023–2025 n'est plus vierge.** Plus aucune règle ne peut y être jugée honnêtement. Les seules données nouvelles sont celles qui viendront après le 21/09/2026 (suivi réel).
- Pas de variante voisine (autre seuil de S, autre durée de bruit).
- Ce résultat ne change rien à F2 : +0,106 R par trade sur 2011–2022, +0,171 sur 2023–2025, négative en 2026 (descriptif).

## Réserves
- Lecture hors protocole d'origine (H1 avait échoué à l'entraînement), faite à la demande de Krystofia et annoncée à l'avance.
- Les trades sont corrélés ; 331 et 166 trades donnent des estimations larges.
