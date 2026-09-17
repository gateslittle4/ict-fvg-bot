# Stratégie exploratoire ICT #12 : Equal Highs / Equal Lows (EQH/EQL) liquidity sweep

⚠ Distinct du Judas Swing / Weekly Liquidity Sweep déjà validés (ceux-ci balayent l'unique extrême le plus récent) : ici il faut DEUX pivots de swing (haut ou bas) situés à moins de 0.1% l'un de l'autre - la doctrine ICT veut que ce double niveau concentre plus de stops resting qu'un extrême unique. Réutilise la détection de swing déjà existante (marketStructure.js, lookback=5). Signal au balayage-puis-reclaim du niveau le plus récent des deux, entrée une bougie après confirmation, stop au-delà de l'extrême du balayage, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 12 instruments disponibles. Écran TRAIN (avant 2024-01-01) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 2935 | 29.2% | 1.04 | 0.04 | 747 | 31.0% | 1.20 | 0.15 | ✅ tient |
| US500 | 2919 | 29.5% | 1.02 | 0.01 | 652 | 28.9% | 1.05 | 0.04 | ✅ tient* |
| XAUUSD | 1944 | 31.2% | 1.06 | 0.05 | 507 | 30.2% | 1.08 | 0.06 | ✅ tient* |
| EURUSD | 1102 | 27.9% | 0.91 | -0.08 | 323 | 27.6% | 0.88 | -0.10 | ❌ ne tient pas |
| GBPUSD | 959 | 26.0% | 0.83 | -0.15 | 275 | 23.8% | 0.72 | -0.25 | ❌ ne tient pas |
| USDJPY | 1467 | 27.7% | 0.90 | -0.09 | 530 | 32.4% | 1.16 | 0.13 | ⚠️ affaibli |
| USDCAD | 1996 | 24.5% | 0.75 | -0.23 | 232 | 30.0% | 0.99 | -0.01 | ❌ ne tient pas |
| GER40 | 2579 | 28.1% | 1.01 | 0.01 | 796 | 28.5% | 1.07 | 0.05 | ✅ tient* |
| UKX | 1201 | 27.2% | 0.90 | -0.09 | 462 | 32.0% | 1.12 | 0.10 | ⚠️ affaibli |
| AUX | 888 | 28.5% | 0.95 | -0.04 | 389 | 28.8% | 0.95 | -0.04 | ❌ ne tient pas |
| NZDJPY | 112 | 22.0% | 0.67 | -0.31 | 58 | 24.1% | 0.72 | -0.26 | ❌ ne tient pas |
| AUDUSD | 538 | 25.9% | 0.81 | -0.17 | 168 | 22.2% | 0.66 | -0.33 | ❌ ne tient pas |

**\* US500/XAUUSD/GER40 : vérifié en séparant achat/vente avant de croire le "✅ tient" agrégé — même discipline que RSI(2) Connors et Bollinger Squeeze plus haut dans ce projet.** Le concept EQH/EQL est censé être symétrique par nature (un balayage de liquidité fonctionne pareil à la hausse qu'à la baisse — ce n'est pas un mécanisme de suivi de tendance), donc un edge réel devrait tenir des deux côtés. Valeurs exactes (non arrondies) :
- **XAUUSD** : train achat exp=+0.0787R (n=1008) / vente exp=+0.0137R quasi nul (n=936) ; test achat exp=+0.1697R / **vente exp=-0.0390R négatif** (n=258). Le "tient" agrégé en test est entièrement porté par le côté achat, sur un instrument déjà connu dans ce projet pour son biais haussier (voir le faux positif RSI Connors XAUUSD ci-dessus). **Faux positif — rejeté.**
- **US500** : train achat exp=+0.0106R / vente exp=+0.0150R — les deux quasi nuls (espérance train globale 0.0128R, indiscernable de zéro comme le XAUUSD/GER40 de RSI Connors) ; test achat exp=+0.1528R / **vente exp=-0.0926R négatif** (n=297). Même signature : rien de mesurable en train, et le "tient" de test n'est qu'un côté acheteur porté par la période, pendant que le côté vendeur perd réellement de l'argent. **Faux positif — rejeté.**
- **GER40** : train achat exp=+0.0479R / **vente exp=-0.0218R négatif** (n=1335, échantillon large — pas du bruit) : le côté vendeur ne fonctionne structurellement pas sur GER40 avec ce mécanisme, même sur 5 ans de train. Le test vendeur remonte à peine au-dessus de zéro (+0.0254R, PF 1.03) — pas une confirmation, un pile ou face. **Faux positif — rejeté.**

**Conclusion révisée : sur les 12 instruments testés, seul US100 montre un edge plausible et symétrique (achat ET vente positifs en train comme en test, PF 1.04→1.20).** Espérance train exacte 0.0358R (PF 1.045, n=2935) — nettement au-dessus du seuil "indiscernable de zéro" (~0.002-0.005R) déjà identifié pour les faux positifs RSI Connors/Bollinger Squeeze de ce projet, avec un échantillon large des deux côtés. Reste un edge modeste (PF proche de 1) à ne pas sur-vendre, mais c'est le seul des 12 qui survit à la fois au verdict train/test ET à la vérification de biais directionnel.