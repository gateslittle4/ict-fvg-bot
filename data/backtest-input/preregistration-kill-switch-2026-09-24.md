# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Arrêt d'une stratégie si sa baisse dépasse 1,5 × sa pire baisse historique

Date : 2026-09-24. Proposé après le rejet du blocage après série de pertes (`streak-block-study.md`) ; Esdras : « teste la version que tu proposes ». C'est une **règle de sécurité** (arrêter une stratégie vraiment cassée), pas une règle pour gagner plus : on s'attend à ce qu'elle se déclenche rarement.

**Déjà vu, déclaré :** R total par jambe et par période du rejeu fidèle et de A/B ; jamais leurs baisses maximales.

## Règle (par jambe = une stratégie sur une paire)
- **Baisse** = plus grand recul du R cumulé depuis son plus haut (en R ; pour B en % du nominal).
- **Référence** = la pire baisse de la jambe sur l'historique déjà connu au moment de l'appliquer.
- Dès que la baisse courante de la jambe (mesurée depuis le début de la période d'application) dépasse **1,5 × la référence**, la jambe est **arrêtée définitivement** pour le reste de la période (plus aucun trade ; « on la réétudie »).

## Deux évaluations
1. **Entraînement → après** : référence = pire baisse 2010-2022 ; appliquée à 2023 → 21/09/2026 (d'un seul tenant).
2. **Glissante, dans l'historique** : référence = pire baisse de 2010-2014 ; appliquée de 2015 à 2026, la référence étant mise à jour chaque 1er janvier avec tout l'historique précédent (tant que la jambe tourne).

## Données
Combo live (rejeu fidèle, 8 jambes, R) + A (ORB US100, R) ; B (noise area US500, %) à part.

## Critère (fixé avant calcul)
- On compte : déclenchements, R de la jambe APRÈS l'arrêt (ce qu'on a évité ou raté), R total avec / sans la règle.
- **Gardée comme filet de sécurité** si, dans les DEUX évaluations, le R total avec la règle ≥ R total sans la règle − 5 % de |R total sans la règle| (elle ne coûte presque rien) ; sinon rejetée. Aucun autre multiple (1,5) essayé.
