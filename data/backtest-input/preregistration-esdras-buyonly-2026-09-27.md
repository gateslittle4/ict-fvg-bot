# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) : achats seulement

Date : 2026-09-27. Esdras : « on était le plus souvent acheteurs, essaie avec les acheteurs seulement ; les ventes étaient très rares,
sauf après un gros mouvement baissier ». L'exception « sauf après un gros mouvement baissier » n'a pas de définition mesurable : elle
n'est pas testée.

## Candidates (mêmes moteurs, seuls les signaux d'achat sont gardés)
- **C1-A** : C1, achats seulement.
- **T1-A** : stop serré 0,25 ATR H1 + 2 réentrées immédiates, achats seulement.

## Attention : dérive du marché
Le US100 a été multiplié par environ 10 entre 2011 et 2026. Un achat gagne souvent « tout seul ». Pour le vérifier, la référence est
**B0-A** : les mêmes achats, mais **sans** le sens H4. Ce sont tous les FVG haussiers après un BMS M15 haussier, avec les mêmes
heures, objectifs et gestion que C1. Une candidate doit battre sa référence pour montrer que la méthode ajoute quelque chose à la
simple dérive :
- C1-A doit battre B0-A ;
- T1-A doit battre B0-A exécuté en T1.

## Critères
1. **Exploration US100 2011-2018**. Une candidate est retenue si elle remplit toutes ces conditions :
   - au moins 60 trades, R moyen > 0, **t ≥ 2,5** ;
   - les deux moitiés positives ;
   - un R moyen supérieur à sa référence sans sens H4.
2. **Si retenue : US500, trois périodes additionnées** : R moyen > 0, t ≥ 2, et mieux que sa référence.
3. **En descriptif** : US100 2019-2022 et 2023-2026.

Aucun réglage.
