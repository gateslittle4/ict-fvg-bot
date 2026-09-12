# FTMO Free Trial (1-Step) — atteindre +5% en 14 jours, empiriquement

Esdras : "j'ai une idée, peux-tu atteindre le 5% du free trial de FTMO dans 14 jours?" Vérifié en direct (help.ftmo.com/FAQ, 2026-09-12) avant de simuler quoi que ce soit : le Free Trial FTMO est un compte démo GRATUIT, durée fixe de 14 jours (on peut en relancer un nouveau ensuite, aucune limite sur le nombre de trials dans le temps), cible réduite de moitié par rapport au vrai challenge (10%→5%), mêmes règles de perte sinon (variante 1-Step : 10% de perte totale trailing fin de journée, 3% de perte quotidienne). **Le passer NE donne PAS de compte financé ni d'avantage confirmé** (FTMO lui-même : "Free Trials... do not guarantee automatic eligibility for an FTMO Account", "not as a qualification step") - ce rapport répond à la question littérale (le système peut-il atteindre +5% dans une fenêtre de 14 jours?), pas à "est-ce un raccourci vers un vrai financement" - ce n'en est pas un.

Testé sur 416 fenêtres de 14 jours différentes (démarrant tous les 7 jours sur 2018-2025), risque 0.5%/trade (mode "challenge" déjà configuré).

| Résultat | Nombre | % |
|---|---|---|
| ✅ Atteint +5% (passé) | 109 | 26% |
| ❌ Busté (-10% trailing) | 0 | 0% |
| ⏱️ Fenêtre expirée sans passer ni buster | 307 | 74% |
| — Non résolu (fin des données) | 0 | 0% |

**Verdict : ~26% des fenêtres de 14 jours testées atteignent +5% dans le délai.** Parmi celles qui passent, le temps médian pour y arriver est de **8.7 jours** (sur les 14 disponibles).

Comparaison utile : ce même système à ce même risque (0.5%) met en moyenne ~63 jours pour atteindre +10% (le vrai challenge payant, voir `ftmo-1step-all-live-strategies-cycle-account-impact.md`) - une cible deux fois plus petite (+5%) sur une fenêtre de 14 jours est mécaniquement plus dure à garantir à coup sûr (pas assez de temps pour laisser la moyenne jouer), d'où le taux de succès plus bas que ce qu'on pourrait naïvement attendre en divisant simplement le temps par deux.

**Ce que ça veut dire concrètement** : le Free Trial peut servir à observer le système tourner sans risque (gratuit, aucun engagement), mais ce n'est ni un raccourci financier (aucun gain réel) ni une garantie de réussite rapide - un taux d'échec/expiration significatif est normal même pour un système qui, sur un horizon plus long (le vrai challenge, 90 jours+), a une espérance largement positive. Rien codé dans `src/` - analyse de recherche seulement.