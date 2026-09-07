# Comparaison des offres "1-Step" (FundingPips, FTMO, GoatFundedTrader) vs notre setup validé

⚠ Sources vérifiées via les pages officielles/aide de chaque firme (ftmo.com, help.goatfundedtrader.com)
début septembre 2026. Les prix exacts par palier de compte ($10k) ne sont publiés nulle part de façon
statique par aucune des 3 firmes (affichés seulement au moment de l'achat) — à vérifier en direct avant
de payer. FundedNext (Stellar 1-Step) et The5ers ont aussi été recherchés mais aucune source fiable n'a
donné le détail chiffré du programme réellement "1 palier" — non inclus ci-dessous plutôt que d'avancer
des chiffres non vérifiés.

## Profil de notre stratégie (rappel, ce qui compte pour choisir)

- ~24-40 trades/an combinés US100+US500 (2-4/mois) → très basse fréquence, chaque jour de trading est rare.
- Win rate validé hors-échantillon : 44.7% (US100) / 42.9% (US500), R:R fixe 1:3, PF ~2.1-2.2.
- Sur 208 trades (2019-2025) : durée médiane 18 min, moyenne 6.2h, max 178h (~7.4 jours). Seuls 3.8%
  des trades traversent un week-end → le risque "règle anti week-end" est marginal, pas structurel.
- Drawdown trailing max observé à 0.5%/trade selon l'année : 0.9% à 4.1% (pire année test 2025 : 3.2%,
  pire année train 2022 : 3.7%). À 0.25%/trade, le pire cas descend à ~0.9-2.0%.
- Horizon réaliste pour boucler un challenge classique : 5-9 mois (déjà établi, pas de raccourci fiable
  via plus de risque — voir fast-challenge-risk-check.md).
- Gains "en grappe" (peu de trades gagnants mais gros grâce au 1:3) → sensible aux règles de consistance
  qui plafonnent le poids du meilleur jour.

## Tableau comparatif

| | FundingPips 2-Step Standard (déjà validé) | FundingPips 1-Step Flex | FTMO 1-Step | FTMO 2-Step | GoatFundedTrader 1-Step |
|---|---|---|---|---|---|
| Cible de profit totale | +8% puis +5% du nouveau solde (~+13.4%) | +12% (un seul palier) | +10% | +10% puis +5% du nouveau solde (~+15.5%) | +10% |
| Perte quotidienne max | 5% | 3% | 3% | 5% | 4% (3% pour comptes achetés à partir du 1er août 2026) |
| Perte totale max | 10%, **statique** (jamais ne bouge) | 12%, **statique** | 10%, **trailing fin de journée** (basé sur le plus haut solde de clôture jamais atteint) | 10%, **statique** | 6%, **statique** (le plus serré des 5) |
| Jours de trading minimum | 3/phase | aucun | non précisé (aucun trouvé) | 4/phase | 3 jours "valides" (chacun ≥0.5% de gain net ce jour-là) |
| Limite de temps | aucune | aucune | **aucune** (confirmé "no time limits") | non précisé | non précisé dans les sources — à confirmer avant achat |
| Règle de consistance | aucune | aucune mentionnée | "Best Day 50%" : le meilleur jour ne doit pas dépasser 50% du profit total des jours positifs — souple, ce n'est même pas une violation bloquante, juste à corriger en continuant à trader | aucune | aucune |
| Restriction week-end (éval.) | non vérifiée | non vérifiée | **aucune en évaluation** (autorisé explicitement ; la règle de clôture ne s'applique qu'une fois financé, sur compte Standard) | idem | autorisé, mais gains supprimés si trade ouvert dans les 3 dernières heures vendredi ET fermé dans les 3 premières heures lundi (pas une violation, juste un ajustement) |
| Restriction news | non vérifiée | non vérifiée | non trouvée | non trouvée | autorisé, mais profit plafonné à 1% du solde initial si trade ouvert/fermé à ±5 min d'une news à fort impact |
| Split de profit | non vérifié | non vérifié | 90% | non précisé | 80% (option payante à 100%) |
| Prix (compte $10k) | non publié statiquement | non publié statiquement | non publié statiquement | non publié statiquement | non publié statiquement |

## Ce que ça veut dire pour notre stratégie

**Cible de profit** : FTMO 1-Step et GoatFundedTrader 1-Step sont à égalité au plus bas (+10%), devant
FundingPips 1-Step Flex (+12%), lui-même devant les deux 2-Step (+13.4% et +15.5%). À stratégie et
fréquence de trades identiques, une cible plus basse = challenge bouclé plus vite, point.

**Coussin de drawdown** : c'est ici que ça se départage. GoatFundedTrader plafonne à 6% statique — avec
notre pire drawdown historique à 0.5%/trade qui a atteint 3.7-4.1% certaines années, ça laisse une marge
réelle mais plus mince que les autres. FTMO (10% trailing fin de journée) et FundingPips (10-12%
statique) laissent 2 à 3x plus de coussin par rapport à notre pire cas observé. À 0.25%/trade (le risque
qu'on recommande de toute façon), tous les trois deviennent confortables, mais FTMO/FundingPips
pardonnent davantage une année inhabituelle que l'historique n'a pas encore vue.

**Jours minimum de trading** : GoatFundedTrader exige 3 jours *gagnants* (pas juste 3 jours avec un
trade) d'au moins 0.5% net — avec notre fréquence basse et ~44% de réussite, un trade gagnant à
0.5%/trade de risque rapporte déjà 1.5% (grâce au 1:3), donc chaque jour gagnant franchit facilement la
barre. Le vrai coût, c'est le temps d'attendre 3 jours gagnants distincts, pas le seuil lui-même.
FundingPips 1-Step Flex et FTMO 1-Step n'imposent aucun minimum trouvé — zéro friction de ce côté.

**Règle de consistance** : le "Best Day 50%" de FTMO est largement plus souple que le 15% de FundingPips
Zero (qu'on a déjà écarté) — avec des gains en grappe comme les nôtres, 50% est presque toujours respecté
naturellement dès qu'on a 2-3 jours gagnants dans l'historique. Aucun souci ici pour FTMO 1-Step, ni pour
les deux autres qui n'ont pas de règle de consistance du tout en évaluation.

**Absence de pression de temps** : confirmée explicitement pour FTMO 1-Step ("no time limits") et déjà
confirmée pour les deux offres FundingPips. Pour GoatFundedTrader, aucune source n'a donné de réponse
claire — **à vérifier directement avec eux avant d'acheter**, vu que notre horizon réaliste est de 5-9
mois et qu'une limite de temps serrée serait éliminatoire pour ce setup.

**Réputation/maturité** : FTMO est la firme la plus ancienne et la plus établie du secteur (référence du
marché depuis 2015, historique de paiement le plus documenté). GoatFundedTrader est une firme plus
récente (vague post-2023) — rien de spécifiquement négatif trouvé dans cette recherche, mais moins de
recul, donc plus de risque de contrepartie à vérifier soi-même (avis récents, preuves de retrait) avant
d'y engager de l'argent, surtout avec un plafond de drawdown aussi serré (6%).

**Split de profit** : FTMO (90%) bat GoatFundedTrader (80%, ou 100% en option payante) sur ce point.

## Recommandation

**FTMO 1-Step ressort en tête** sur ce comparatif : cible la plus basse (+10%, ex-aequo avec
GoatFundedTrader), le plus grand coussin de drawdown par rapport à notre historique (10% vs 6%), aucun
minimum de jours trouvé, aucune limite de temps confirmée, règle de consistance souple et non
bloquante, meilleur split (90%), et la firme la plus établie du marché.

**FundingPips 1-Step Flex reste un excellent second choix** : cible légèrement plus haute (+12%), mais
coussin de drawdown encore plus large (12% statique) et zéro minimum de jours — à comparer au prix réel
une fois vu en caisse, comme FTMO.

**FundingPips 2-Step Standard reste le filet de sécurité** : cible totale plus haute (+13.4%) et 3 jours
minimum par phase, mais perte quotidienne la plus généreuse (5%) et déjà entièrement validé dans ce
projet — l'option "on sait déjà que ça marche" si les deux 1-Step ci-dessus posent un souci au moment de
l'achat (prix, conditions non confirmées, etc.).

**Prochaine étape concrète** : vérifier en direct sur ftmo.com et fundingpips.com le prix exact d'un
compte $10,000 en 1-Step pour les deux, plus confirmer auprès de GoatFundedTrader s'il existe une limite
de temps sur leur 1-Step avant de l'exclure ou de la garder en 3e position.
