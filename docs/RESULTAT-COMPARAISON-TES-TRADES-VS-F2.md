# Résultat — tes trades réels de 2025 contre les signaux de F2

Définitions : `PREREG-COMPARAISON-TES-TRADES-VS-F2.md` (SHA-256 `0bfa1254…7598`, 2026-10-06 22:39 heure de New York), commité avant tout calcul. **Descriptif** : aucun critère, aucune règle. Code : `scripts/comboFvgV6/compareMesTradesF2.mjs` (4 tests). Les parties « vérifications ajoutées après coup » (scripts `…_extra1.mjs` et `…_extra2.mjs`) ont été écrites après avoir vu le résultat principal ; elles sont signalées comme telles.

## 1. Aurais-je pris tes trades ? (F2 contre tes 646 trades, mars–juillet 2025)
F2 a posé 206 ordres d'achat (96 remplis) et le miroir de vente 281 ordres (130 remplis) sur l'année 2025.

| | Trades | Hors 06–16 NY | A : même jour | B : ordre vivant | C : même zone (≤ 0,1 %) | D : rempli au même moment |
|---|---|---|---|---|---|---|
| Achats | 392 | 78 (20 %) | 94 (24 %) | 30 (8 %) | 17 (4 %) | 18 (5 %) |
| Ventes | 254 | 41 (16 %) | 89 (35 %) | 53 (21 %) | 12 (5 %) | 11 (4 %) |
| Total | 646 | 119 (18 %) | 183 (28 %) | 83 (13 %) | 29 (4 %) | 29 (4 %) |

**Réponse courte : pour environ 95 % de tes trades de 2025, F2 n'aurait pas posé d'ordre dans la même zone au même moment** (32 trades sur 646 en niveau C ou D). Ton trading de 2025 et F2 sont deux méthodes très différentes (durées de quelques minutes, pertes de 25 à 36 $, entrées sur des unités plus fines, 18 % des trades hors de la fenêtre de F2).

Ce qu'ont donné tes trades qui coïncident avec F2 (niveau C ou D, 32 trades) : +1 605 $, 41 % de gagnants ; les 614 autres : −294 $, 24 % de gagnants. **À lire avec prudence** : trois trades (485 $, 479 $, 297 $) font l'essentiel du gain ; sans les trois plus gros, le groupe fait +344 $, et la médiane est de −4,6 $ par trade. Rien ici n'est une règle.

## 2. Dans l'autre sens : les trades de F2, les as-tu pris ?
Du 7 mars au 30 juillet 2025, F2 (achats) a rempli **36 trades** (R moyen de F2 +0,77). Tu en as pris **15** (un achat à toi dans l'heure autour du remplissage et à moins de 0,1 % du prix d'entrée de F2), **21 non**.

| | Trades F2 | R moyen de F2 | TP touchés |
|---|---|---|---|
| Que tu as pris | 15 | **+2,05** | 11 sur 15 |
| Que tu n'as pas pris | 21 | **−0,14** | 3 sur 21 |

Les R sont ceux de F2 (pas tes résultats). Test de permutation des étiquettes (vérification ajoutée après coup) : probabilité d'un écart aussi grand par hasard ≈ 0,001. Contrôle ajouté après coup : si on décale tes heures de 3 à 20 jours (mêmes prix), on ne retrouve que 0 à 3 correspondances au lieu de 15 ; ce contrôle est strict (le prix change d'un jour à l'autre), il montre seulement que le recouvrement n'est pas un pur hasard de calendrier.

## Ce que cela dit, et ne dit pas
- **Ça va dans le sens de ton impression** : en 2025, quand F2 a donné un signal que tu as pris aussi, il a presque toujours abouti (11 TP sur 15) ; parmi ceux que tu as laissés, seuls 3 sur 21 ont touché le TP. Ton jugement du moment (contexte, nouvelles, ce que tu vois avant le creux) semble avoir trié mieux que F2 seule. C'est ce que le tri à l'aveugle ne pouvait pas voir : les graphiques à l'aveugle n'avaient pas ce contexte.
- **Mais ce n'est pas démontré.** C'est 36 trades en cinq mois, une seule période (le printemps 2025, avec une forte baisse puis un rebond), analysée après coup. Le tri à l'aveugle sur 2011–2022 (79 signaux) donnait l'inverse : ce que tu prenais faisait −0,28 R, ce que tu sautais +0,35 R. Deux petits échantillons dans des sens opposés : aucun des deux ne tranche.
- Possible aussi : ta prise suit le mouvement (tu as pu entrer parce que le prix réagissait), ce qui n'est pas la même chose que juger le signal à l'avance. Seul un enregistrement **avant** le résultat peut séparer les deux.
- Les tolérances (0,1 %, ±1 bougie, ±60 minutes) ont été écrites d'avance ; je n'en ai pas essayé d'autres.

## La suite possible (décision de Krystofia)
Le test propre est **prospectif** : à partir des prochains signaux de F2, tu notes ta décision (je prends / je saute) **avant** que le trade ne se termine, puis on compare les résultats de F2 sur tes « pris » et tes « sautés ». C'est exactement la question « mon tri améliore-t-il F2 ? », avec des données neuves. Je peux préparer le tableau.
