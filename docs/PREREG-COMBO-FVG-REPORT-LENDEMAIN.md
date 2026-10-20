# Pré-enregistrement — F2 avec report au lendemain, variante B (06/10/2026)

Écrit AVANT le calcul. Idée de Krystofia : le low H4 est pris un jour (NY), mais le FVG d'achat ne se forme que le lendemain matin, quand aucun FVG n'a pu être pris le jour du balayage. Source : le trade du 2 oct. 2026 (non utilisé pour régler quoi que ce soit ; non vérifié ici, les données du bot s'arrêtent au 21/09).

## Règle testée (J)
F2 inchangée (achats, 06:00–16:00 NY, FVG d'entrée ≤ 8 bougies, balayage du low des 6 dernières barres H4 dans les 32 bougies avant c3, entrée 50 %, stop c1 − 3, TP max(½ cible, 3R), échelle prix/8200), PLUS un report : un FVG d'achat est aussi accepté si
1. son c3 tombe le jour NY qui suit exactement le jour du dernier balayage (veille calendaire ; un balayage du vendredi ne se reporte pas au lundi) ; et
2. aucun FVG d'achat M15 strict (c1.high < c3.low) n'a eu son c3 le jour du balayage, après la bougie de balayage, entre 06:00 et 16:00 NY (occasion de trade déjà passée = pas de report). Le report vaut jusqu'à la fin du lendemain ; un nouveau balayage remplace l'ancien.
Jours = jours civils heure de New York (pas UTC).

## Critères de réussite (tous requis)
1. ≥ 1,5 trade par semaine sur 2023–2025 (155 semaines ; seul le nombre de trades est lu à l'étape 1).
2. Entraînement 2011–2022 : t ≥ 3,0 (seuil relevé : environ 16 hypothèses sur ces données, 0,05 / 16), moyenne > 0 dans 2011–2016 ET 2017–2022.
3. Moyenne 2011–2022 supérieure à F2 (+0,106) ET moyenne des trades admis par le report seul > 0 (sinon le report n'apporte rien).
4. Étape 2, lecture unique, seulement si 1–3 passent : test 2023–2025 moyenne > 0. 2026 : rapporté, pas un critère.
Sinon : « non validée », pas d'autre essai sur ces données.

## Empreintes (SHA-256)
- 12e6d000f6a5295cef13e1c56988e20b883fb985c37266c4e10ca3df64d1f041  comboJ.mjs
- 6ccb1570f12557fc959da5193ebf210ba305a46160f8b822216f3ca9ca0a78e5  comboJ.test.mjs
