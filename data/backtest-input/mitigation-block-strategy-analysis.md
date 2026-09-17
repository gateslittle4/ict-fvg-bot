# Stratégie exploratoire ICT #14 : Mitigation Block (échec de structure, pas un BOS)

⚠ Distinct de l'Order Block et du Breaker Block déjà testés (les deux exigent un BOS réussi) : ici le signal vient d'un ÉCHEC à casser la structure (un plus haut plus bas que le précédent, ou un plus bas plus haut que le précédent - une 'failure swing'), sans BOS préalable ni cassure ultérieure. Le bloc = la dernière bougie de couleur opposée avant le mouvement échoué (réutilise breakerBlock.js/findOrderBlock tel quel), le trade pris = le sens INVERSE du mouvement échoué. Entrée au retest du bloc, une bougie après confirmation, stop au-delà du bord du bloc, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 12 instruments disponibles. Écran TRAIN (avant 2024-01-01) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 4439 | 26.9% | 0.96 | -0.03 | 881 | 26.4% | 1.01 | 0.01 | ⚠️ affaibli |
| US500 | 4304 | 27.0% | 0.94 | -0.05 | 849 | 24.4% | 0.87 | -0.11 | ❌ ne tient pas |
| XAUUSD | 4017 | 25.7% | 0.82 | -0.15 | 888 | 25.3% | 0.88 | -0.10 | ❌ ne tient pas |
| EURUSD | 1942 | 25.7% | 0.84 | -0.14 | 650 | 21.4% | 0.65 | -0.33 | ❌ ne tient pas |
| GBPUSD | 1684 | 25.7% | 0.83 | -0.14 | 600 | 24.0% | 0.74 | -0.23 | ❌ ne tient pas |
| USDJPY | 2690 | 25.2% | 0.81 | -0.16 | 804 | 26.0% | 0.89 | -0.09 | ❌ ne tient pas |
| USDCAD | 4039 | 24.0% | 0.75 | -0.22 | 447 | 26.0% | 0.81 | -0.17 | ❌ ne tient pas |
| GER40 | 3844 | 29.0% | 1.12 | 0.09 | 930 | 28.5% | 1.12 | 0.09 | ✅ tient |
| UKX | 2061 | 25.9% | 0.87 | -0.11 | 739 | 26.9% | 0.91 | -0.07 | ❌ ne tient pas |
| AUX | 1683 | 24.2% | 0.80 | -0.17 | 731 | 27.1% | 0.92 | -0.06 | ❌ ne tient pas |
| NZDJPY | 328 | 26.5% | 0.80 | -0.19 | 170 | 31.8% | 1.03 | 0.03 | ⚠️ affaibli |
| AUDUSD | 1264 | 27.0% | 0.86 | -0.12 | 419 | 23.9% | 0.71 | -0.27 | ❌ ne tient pas |

**Vérification achat/vente sur le seul "✅ tient" (GER40) avant de le croire, même discipline que partout ailleurs.** Train achat exp=+0.119R (n=1971, PF 1.158) / vente exp=+0.056R (n=1873, PF 1.073) ; test achat exp=+0.144R (n=506, PF 1.195) / vente exp=+0.023R (n=424, PF 1.030). Les deux côtés restent POSITIFS dans les deux fenêtres (pas de piège de biais directionnel classique), mais le côté vente est nettement plus faible et ténu (PF à peine au-dessus de 1) — l'edge de GER40 est donc réel mais porté surtout par le côté achat. **Conclusion : Mitigation Block tient sur GER40 uniquement**, dans la même veine que Breaker Block (déjà validé GER40 seul) — GER40 continue d'être, dans ce projet, l'instrument où les mécanismes de retournement de structure ICT tiennent le mieux.