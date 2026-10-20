# Pré-enregistrement — F2 en miroir (ventes) avec tendance daily baissière (TD2S)

Écrit le 2026-10-07, AVANT tout calcul de cette étude (aucun résultat de cette règle n'a été regardé). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia, après la lecture de TD2 (« on fait la même chose pour la tendance baissière »). La tendance daily est celle de TD2 (`PREREG-F2-TENDANCE-DAILY-PD.md`), déjà validée par elle, utilisée dans le sens baissier.

## Contrôle (F2S : ventes en miroir, sans filtre daily)
Même moteur que F2, côté vente, ventes seulement, sans aucun filtre daily : balayage du **high** des 6 dernières barres H4 complètes dans les 32 bougies M15 avant c3 ; FVG M15 strict de vente (c1.low > c3.high), validé par c4 ; 06–16 NY ; âge ≤ 8 ; entrée à 50 % ; stop = haut de c1 + 3 pts ; TP = le plus bas entre la moitié du FVG M15 haussier à gauche et 3 R ; spread 0,6 (mises à l'échelle) ; sortie au temps à 96 bougies ; stop d'abord. Le contrôle est calculé ici sur 2011–2022 et sert de référence ; il n'a pas de valeurs attendues connues (voir divulgations).

## La règle TD2S (une seule hypothèse, figée)
- Mêmes règles que F2S, plus : un ordre de vente n'est posé que si l'état de la tendance daily de TD2 (barres daily complètes avant le jour de la bougie de pose) est **baissier** (état −1). Neutre ou haussier : pas d'ordre.
- Définition de la tendance daily : celle de TD2, inchangée (low / high daily pris et rejeté, FVG daily touché et rejeté, jusqu'au premier événement opposé ; pivot de 2 barres ; FVG strict à 3 barres, mort quand rempli entièrement ; daily alignée sur minuit NY).
- Aucune autre valeur essayée (ventes avec fenêtre plus large, filtre H4 enlevé, seulement le high, seulement le FVG, achats + ventes ensemble) : si TD2S échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Mêmes critères et mêmes seuils que TD2, avec F2S comme contrôle ; trades appariés par année + bougie de pose + bougie de création de la zone :
1. R moyen de TD2S ≥ R moyen de F2S + 0,03.
2. t de Welch ≥ 1,96 entre les trades de TD2S et les trades de F2S absents de TD2S.
3. TD2S > F2S et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2S.
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, uniquement si l'entraînement passe)
R moyen de TD2S > R moyen de F2S sur 2023–2025 et > 0, et R moyen des trades de F2S absents de TD2S < R moyen de TD2S. 2026 : descriptif.

## Descriptif (non jugé)
Sur F2S 2011–2022 : nombre et R moyen des ventes prises quand la daily est baissière, haussière, neutre ; part du temps en état baissier par an.

## Divulgations
- **Le contrôle F2S n'est pas recoupé avec l'étude précédente d'ajout des ventes** (`RESULTAT-F2-AJOUT-VENTES.md`) : le lien avec ton ordinateur est coupé et je n'ai pas pu relire ce document ni le code `comboZ_ventes.mjs`. J'ai construit le miroir à partir des règles de F2 (même moteur, côté vente). Si le miroir diffère de celui d'alors, les chiffres peuvent différer ; je comparerai quand le lien reviendra.
- **Choix de moi** : ventes seulement (pas d'achats en même temps) ; état baissier de TD2 pris tel quel (symétrique) ; contrôle = F2S sans filtre daily.
- **Contexte** : tu as dit toi-même que les ventes sont difficiles et que tu prends peu de trades baissiers ; les tests précédents des ventes mécaniques étaient négatifs sur les périodes haussières (2023–2025). Un échec ici ne dirait rien sur tes ventes à la main.
- **TD2 a échoué hors échantillon** (2023–2025 : +0,088 R contre +0,171 pour F2C, les trades retirés valant +0,239 ; 2026 : −0,346). Le versant baissier de la même tendance hérite de cette incertitude.
- Même série de variantes que TD2 : le seuil de 1,96 n'est pas corrigé pour les comparaisons multiples. 2023–2025 n'est pas vierge pour les achats de F2 (mais n'a jamais été lu pour les ventes miroir de cette règle).
- Les trades sont corrélés ; les t sont un peu flatteurs. Clé d'appariement corrigée (voir `CORRECTION-APPARIEMENT.md`).

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAE_dailyPD_ventes.mjs <data> train`, puis `... test` si l'entraînement passe.
