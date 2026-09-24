# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Filtre « journées de tendance » pour A (ORB 5 min US100) et B (noise area US500)

Date : 2026-09-24. Idée : A et B gagnent grâce aux journées de tendance ; ne les trader que lorsque le marché récent en produit beaucoup (détection du régime en temps réel). Demande d'Esdras : « teste le filtre journées de tendance ».

**Déjà vu, déclaré :** la part annuelle de journées de tendance de US100/US500 pour 2019-2026 (41 % à 58 %, 2026 = 41 %), et les résultats non filtrés de A et B (`intraday-momentum-study.md`) et leur diagnostic 2026 (moins de gros gagnants). Pour ne pas choisir un seuil sur ces chiffres, le seuil est **relatif et glissant** (pas de nombre fixe).

## Définitions
- **Journée de tendance** (séance 9:30-16:00 NY, barres M1) : la clôture est dans les 20 % extrêmes du range de la séance, du côté du mouvement ouverture → clôture (clôture > ouverture et (clôture − bas) / (haut − bas) ≥ 0,8, ou miroir). Même définition que la décomposition montrée à Esdras.
- **Part récente** = part de journées de tendance sur les **20 séances précédentes** (le jour du trade exclu : connu avant 9:30), calculée sur l'indice tradé (US100 pour A, US500 pour B).
- **Filtre ACTIF (on trade)** si la part récente ≥ la **médiane de cette même part sur les 250 séances précédentes**. Sinon, pas de trade ce jour-là. Il faut 270 séances d'historique : avant, pas de décision (jours exclus des deux groupes).
- A et B inchangés par ailleurs (règles de `preregistration-intraday-momentum-2026-09-23.md`, `scripts/lib/intradayMomentum.js`).

## Critère (fixé avant calcul)
Pour chaque stratégie (A-US100, B-US500) séparément, sur l'entraînement 2010-2022 :
- Écart = moyenne par trade des jours « filtre actif » − moyenne des jours « filtre inactif » (A en R, B en % du nominal), t de Welch.
- **Filtre retenu** si : écart > 0 avec **t ≥ 2**, écart positif en 2010-2016 ET en 2017-2022, et au moins 30 % des trades conservés ; PUIS au test 2023-2025 (lu une fois) : écart > 0. 2026 : descriptif (le filtre aurait-il évité les pertes ?).
- Tests multiples : 2 filtres (A et B). Retenu → proposé en démo avec A/B, pas d'adoption directe. Rejeté → A et B restent sans filtre ; on n'essaie pas d'autres seuils.
