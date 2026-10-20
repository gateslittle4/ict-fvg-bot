# Pré-enregistrement — F2 : « pas de trade quand le stop est trop court » (H1) et « breakeven à 1 R » (H2)

Écrit le 2026-10-06, AVANT tout calcul de cette étude. Règles et critères figés : aucun amendement après lecture. Fait suite à `RESULTAT-ETUDE-PERTES-F2.md` (H1 y est née comme piste) et à la demande de Krystofia (H2).

## Contrôle (inchangé)
F2C = F2 sur la série continue (`CRITERE-DEMO-F2.md`, `krysBacktestC.js`). À retrouver : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, 129,7 R, pire baisse 27,4 R. Toutes les variantes sont comparées à F2C.

## H1 — pas d'ordre quand le stop est court par rapport au bruit
- S = risque de l'ordre (distance entrée → stop, en points) / amplitude moyenne (haut − bas) des **96 bougies M15 qui précèdent la bougie de pose de l'ordre** (une journée de bougies ; on ne regarde rien d'après la pose).
- **Règle : on ne pose l'ordre que si S ≥ 1,76** (la médiane de S observée sur 2011–2022 dans l'étude précédente). Tout le reste de F2 est inchangé. Un seul seuil, pas d'autre.
- **Divulgation importante** : le seuil vient des quartiles que j'ai vus sur 2011–2022 (les deux groupes sous 1,76 étaient à ≈ 0 R). L'entraînement n'est donc **pas vierge** pour H1 ; le réussir est nécessaire mais ne prouve rien. La seule preuve possible est 2023–2025, dont aucun R n'a été regardé en lien avec S.

## H2 — breakeven à 1 R
- Dès qu'un trade ouvert voit son plus haut atteindre entrée + 1 R (risque initial) **dans une bougie postérieure à la bougie de remplissage**, le stop passe à l'entrée **à partir de la bougie suivante** (pas dans la même bougie : on ne sait pas dans quel ordre le prix a bougé ; convention pessimiste). Une sortie sur ce stop vaut 0 R. Le TP est inchangé, la sortie au temps aussi. Un trade qui n'atteint jamais +1 R est identique à F2C.
- Le stop et le TP touchés dans la même bougie restent traités comme dans F2 (le stop gagne). Le spread est traité comme dans F2 (payé à l'entrée).
- Tout le reste de F2 est inchangé. Les trades ne sont donc pas tous les mêmes : un trade qui sort à 0 R libère plus tôt la position et peut laisser entrer un ordre que F2C avait manqué ; ces effets de bord sont comptés.

## Hypothèses et seuils
Deux hypothèses (H1, H2) : seuil unilatéral à 5 % / 2, soit t ≥ 1,96 pour chacune. Elles s'ajoutent à toutes celles déjà testées sur F2 ; le t des études précédentes, un peu flatteur (trades corrélés), l'est aussi ici.

## Critères d'entraînement (tous requis, sur 2011–2022)
**H1** (mêmes critères que `PREREG-F2-CIBLE-RECENTE.md`, seuil de t à 1,96) :
1. R moyen de la variante ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades gardés et les trades supprimés (appariés par année + bougie de pose).
3. Variante > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C.
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

**H2** (comme `PREREG-F2-STOP-LARGE.md`) :
1. R moyen de la variante ≥ R moyen de F2C + 0,03.
2. t apparié ≥ 1,96 sur les trades appariés (même année + même bougie de pose) : R de la variante − R de F2C.
3. Variante > F2C et > 0 dans A et dans B.
4. Pire baisse ≤ 1,25 × celle de F2C.
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025.

## Lecture du test 2023–2025 (une seule fois, seulement pour les variantes qui passent)
- H1 : R moyen de la variante > R moyen de F2C sur 2023–2025 et > 0, et R moyen des trades supprimés < R moyen des trades gardés.
- H2 : R moyen de la variante > R moyen de F2C sur 2023–2025 et > 0, et différence moyenne appariée > 0.
Pas de critère de t. 2026 : descriptif.

## Descriptif ajouté (aucun jugement)
- H1 : nombre de trades supprimés et part de F2C ; quartiles de S inchangés par rapport à l'étude précédente.
- H2 : part des trades qui touchent +1 R, part qui sortent à 0 R, part des gagnants de F2C qui deviennent des 0 R (revenus à l'entrée après +1 R avant le TP), part des stops de F2C qui deviennent des 0 R ; R total et pire baisse.

## Verdict possible
- **Aucune ne passe l'entraînement** : F2 reste telle quelle. Pas de variante voisine (S = 1,5 ou 2, breakeven à 0,5 R ou 1,5 R, breakeven + trailing, etc.).
- **Passe l'entraînement et le test** : candidate ; la règle ne change pas d'elle-même, Krystofia décide.
- **Passe l'entraînement, échoue au test** : rejetée.

## Divulgations
- H2 est une idée de Krystofia, pas tirée des données ; l'AFM (28 % des stops avaient atteint +1 R) est un descriptif qui n'a pas servi à fixer 1 R. Pour H1, le seuil, lui, a été fixé après lecture de la table de S.
- Le breakeven ne change pas l'espérance d'un marché sans avantage : il transforme des pertes en zéros et coupe certains gagnants. Un résultat nul ou négatif est probable a priori.
- Convention de simulation : le stop au breakeven est au prix d'entrée (déjà « payé » en spread au remplissage) ; en réel, un stop au breakeven peut être exécuté avec du glissement et des frais.
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboT.mjs <data> train`, puis `... test H1,H2` pour les variantes qui passent. Moteur : `lib/krysBacktestC.js` (option `beR` ajoutée, inactive par défaut : identité vérifiée par test avec F2C).
