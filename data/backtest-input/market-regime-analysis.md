# Analyse par régime de marché (bull / bear / range) — FVG, Divergence, RSI(2)

⚠ Question posée : les analyses précédentes tenaient-elles compte de la tendance du marché (bullish/bearish/range) ? Réponse honnête : NON, pas explicitement. Les proxys les plus proches existants étaient le filtre de biais EMA (H1/H4) et le filtre de structure/BOS, qui décrivent la tendance LOCALE au moment de l'entrée, pas le régime quotidien global ; et les tableaux année-par-année, qui mélangent tous les régimes à l'intérieur d'une même année sans jamais les séparer. Ceci comble ce manque : classification ADX(14) Wilder + SMA(100) quotidienne (seuil ADX=25, convention manuel/textbook standard, décidée AVANT de regarder un seul résultat de ce script - même discipline que partout ailleurs dans ce projet). Chaque trade (FVG par instrument, Divergence, RSI-2) est étiqueté avec le régime de la DERNIÈRE bougie quotidienne COMPLÈTEMENT CLÔTURÉE avant son entrée (aucun regard en avant, même pour les entrées intra-journalières du FVG en M15). Calcul sur l'échantillon COMPLET 2019-2025 par (stratégie, instrument, régime) - volontairement pas re-séparé train/test ici : c'est un diagnostic descriptif d'une règle déjà validée, pas une nouvelle recherche de paramètre, donc pas de risque de data-snooping à regarder l'échantillon complet pour avoir assez de trades par case.

## Répartition des jours par régime (par instrument)

| Instrument | Jours bull | Jours bear | Jours range | Jours non classés (historique insuffisant) |
|---|---|---|---|---|
| US100 | 567 | 242 | 1270 | 99 |
| US500 | 609 | 228 | 1242 | 99 |
| XAUUSD | 703 | 235 | 1142 | 99 |

## FVG (config validée par instrument) par régime

### US100

| Régime | Trades | WR | PF | Espérance (R) |
|---|---|---|---|---|
| bull | 21 | 57.1% | 3.67 | 1.21 |
| bear | 10 | 50.0% | 2.83 | 0.96 |
| range | 71 | 43.7% | 2.06 | 0.65 |
| non classé | 6 | 50.0% | 2.53 | 0.87 |

### US500

| Régime | Trades | WR | PF | Espérance (R) |
|---|---|---|---|---|
| bull | 18 | 55.6% | 3.04 | 1.07 |
| bear | 12 | 41.7% | 1.89 | 0.57 |
| range | 64 | 38.7% | 1.74 | 0.49 |
| non classé | 7 | 57.1% | 3.24 | 1.14 |

### XAUUSD

| Régime | Trades | WR | PF | Espérance (R) |
|---|---|---|---|---|
| bull | 48 | 38.3% | 1.78 | 0.50 |
| bear | 13 | 46.2% | 2.22 | 0.73 |
| range | 61 | 46.7% | 2.36 | 0.78 |
| non classé | 5 | 20.0% | 0.63 | -0.33 |

## Divergence (US100/US500) par régime

### US100 (jambe longue de la paire)

| Régime | Trades | WR | PF | Espérance (R) |
|---|---|---|---|---|
| bull | 87 | 27.9% | 1.18 | 0.13 |
| bear | 40 | 32.5% | 1.43 | 0.29 |
| range | 219 | 31.2% | 1.34 | 0.24 |
| non classé | 10 | 60.0% | 4.30 | 1.36 |

### US500 (jambe longue de la paire)

| Régime | Trades | WR | PF | Espérance (R) |
|---|---|---|---|---|
| bull | 104 | 28.8% | 1.16 | 0.12 |
| bear | 32 | 31.3% | 1.33 | 0.23 |
| range | 211 | 33.0% | 1.45 | 0.31 |
| non classé | 26 | 23.1% | 0.83 | -0.14 |

## RSI(2) retour à la moyenne (réserve, US100/US500) par régime

### US100

| Régime | Trades | WR | PF | Espérance (R) |
|---|---|---|---|---|
| bull | 68 | 67.6% | 1.47 | 0.11 |
| bear | 29 | 58.6% | 1.27 | 0.07 |
| range | 158 | 74.1% | 1.54 | 0.12 |

### US500

| Régime | Trades | WR | PF | Espérance (R) |
|---|---|---|---|---|
| bull | 67 | 70.1% | 1.66 | 0.14 |
| bear | 27 | 51.9% | 1.17 | 0.04 |
| range | 169 | 66.9% | 1.35 | 0.09 |
