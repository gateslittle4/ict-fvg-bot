# Stratégie exploratoire ICT #15 : Power of Three / AMD (modèle complet à 3 sessions)

⚠ Distinct de l'Asian Range Fade déjà testé (qui confond Manipulation et Distribution dans une seule fenêtre continue et entre immédiatement après le balayage). Ici, la Manipulation (balayage-puis-reclaim de la range asiatique pendant le killzone de Londres, 02h-05h NY) doit avoir eu lieu AVANT que la Distribution ne commence : l'entrée est différée à la PREMIÈRE bougie du killzone NY AM (08h-11h NY), une session plus tard, pas la bougie suivant immédiatement le balayage. Stop au niveau extrême du balayage, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 12 instruments disponibles. Écran TRAIN (avant 2024-01-01) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1115 | 24.8% | 0.91 | -0.07 | 216 | 25.1% | 0.97 | -0.02 | ❌ ne tient pas |
| US500 | 1075 | 25.3% | 0.94 | -0.05 | 214 | 25.9% | 0.99 | -0.01 | ❌ ne tient pas |
| XAUUSD | 1078 | 24.9% | 0.89 | -0.09 | 164 | 26.9% | 1.06 | 0.05 | ⚠️ affaibli |
| EURUSD | 503 | 24.4% | 0.94 | -0.05 | 170 | 25.9% | 0.96 | -0.03 | ❌ ne tient pas |
| GBPUSD | 403 | 23.5% | 0.93 | -0.06 | 172 | 22.9% | 0.85 | -0.12 | ❌ ne tient pas |
| USDJPY | 591 | 25.1% | 0.89 | -0.09 | 153 | 24.3% | 0.89 | -0.09 | ❌ ne tient pas |
| USDCAD | 1091 | 24.2% | 0.87 | -0.10 | 157 | 26.1% | 0.93 | -0.06 | ❌ ne tient pas |
| GER40 | 143 | 25.2% | 1.04 | 0.03 | 170 | 27.3% | 1.13 | 0.09 | ✅ tient* |
| UKX | 405 | 23.8% | 0.97 | -0.03 | 169 | 21.2% | 0.85 | -0.12 | ❌ ne tient pas |
| AUX | 334 | 26.7% | 0.98 | -0.01 | 135 | 29.3% | 1.14 | 0.10 | ⚠️ affaibli |
| NZDJPY | 254 | 25.2% | 0.83 | -0.14 | 91 | 22.6% | 0.77 | -0.20 | ❌ ne tient pas |
| AUDUSD | 343 | 26.4% | 0.96 | -0.03 | 125 | 22.8% | 0.76 | -0.21 | ❌ ne tient pas |

**\* GER40 : le seul "✅ tient" mécanique, mais l'échantillon est le plus petit de tout ce document (n=143 en train) et la vérification achat/vente révèle une INCOHÉRENCE entre les deux fenêtres, pas une confirmation.** Valeurs exactes : train achat exp=+0.113R (n=86, PF 1.164) / **vente exp=-0.103R négatif** (n=57, PF 0.868) ; test achat exp=+0.085R (n=114) / vente exp=+0.113R (n=56) — le côté vente passe de négatif à positif d'une fenêtre à l'autre, avec un échantillon (n=57/56) trop petit pour distinguer ça d'un simple retournement de bruit. Ce n'est pas la signature habituelle du piège de biais haussier (un côté qui reste négatif en test) mais celle, tout aussi disqualifiante, d'un signal qui ne se reproduit pas de façon stable d'une période à l'autre — même défaut que GBPUSD dans le document Silver Bullet ci-dessus. **Conclusion révisée : aucun des 12 instruments ne valide réellement le modèle Power of Three à 3 sessions complet — GER40 ne tient pas non plus une fois vérifié.**

**Conclusion générale :** le fait de différer l'entrée du balayage de Londres jusqu'à la session de Distribution NY (au lieu d'entrer immédiatement, comme le fait Asian Range Fade déjà testé) ne produit d'edge robuste sur aucun des 12 instruments. Contrairement à Asian Range Fade (qui tenait sur GER40/US500), imposer la séparation stricte des 3 sessions dégrade le résultat plutôt que de le renforcer — un indice que le délai lui-même (attendre la bonne session) ne capture pas mieux le mouvement réel de la journée que d'agir dès le reclaim.