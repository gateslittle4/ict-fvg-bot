# Lecture exploratoire — H1 (stop court, S ≥ 1,76) sur 2023–2025 et 2026

Écrit le 2026-10-06, AVANT cette lecture. Fait suite à `RESULTAT-F2-STOP-COURT-ET-BREAKEVEN.md` : H1 a échoué à l'entraînement sur un seul critère (t de Welch 1,62 pour 1,96), donc le protocole d'origine ne prévoyait pas de lire le test. Krystofia demande de le lire quand même. Je le fais en le disant clairement : **c'est une lecture exploratoire, pas une validation**.

## Ce qui est lu (une seule fois)
- Règle H1 inchangée (S = risque / amplitude moyenne des 96 bougies M15 précédant la pose ≥ 1,76) ; F2C comme contrôle ; même moteur et même commande : `comboT.mjs <data> test H1`.
- 2023–2025 : n, R moyen, t, pire baisse, trades par semaine de F2C et de H1 ; R moyen des trades supprimés et des trades gardés.
- 2026 (au 21/09) : descriptif seulement.

## Critère de lecture (celui prévu pour H1 au test)
**Indice favorable** si, sur 2023–2025 : R moyen de H1 > R moyen de F2C, R moyen de H1 > 0, et R moyen des trades supprimés < R moyen des trades gardés. Sinon : indice défavorable. Pas de critère de t.

## Ce que ce résultat pourra et ne pourra pas dire
- Même « favorable », H1 **n'est pas validée** : elle a échoué à son entraînement, et le protocole voulait deux épreuves réussies. Le résultat sera un indice, rien de plus. F2 reste inchangée tant que Krystofia ne décide pas autrement.
- **2023–2025 ne sera plus vierge** après cette lecture : plus aucune autre règle ne pourra y être jugée honnêtement. Les seules données nouvelles seront celles qui viendront après le 21/09/2026 (suivi réel).
- Pas de variante voisine (autre seuil de S, autre durée de bruit) après cette lecture, quel que soit le résultat.
- Le seuil de 1,76 a été fixé après avoir vu les quartiles de S sur 2011–2022 ; le test 2023–2025 n'a jamais servi à le choisir (aucun R de 2023–2025 n'avait été lu en lien avec S).
- Une seule hypothèse de plus sur F2 parmi beaucoup d'autres : même un résultat favorable doit être lu avec cette réserve.
