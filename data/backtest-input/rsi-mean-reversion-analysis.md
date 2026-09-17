# Stratégie exploratoire non-ICT #3 : retour à la moyenne RSI(2) (Larry Connors)

⚠ Choisie pour combiner ce que Turtle et ORB avaient chacun manqué : un vrai historique documenté (Connors, 2004) ET une durée de position courte (max 10 jours, compatible avec le netting - contrairement à Turtle). Contrairement à la Divergence, c'est un signal sur UN SEUL instrument (RSI extrême + filtre de tendance EMA200), pas une relation entre deux instruments. Bougies journalières. Entrée = RSI(2) < 5 en tendance haussière (EMA200) ou RSI(2) > 95 en tendance baissière, remplissage à l'ouverture du jour SUIVANT. Stop = 2xATR(14). Sortie = clôture qui retraverse la SMA(5) (cible classique de Connors), stop touché, ou 10 jours max. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 508 | 69.1% | 1.39 | 0.09 | 54 | 70.4% | 1.39 | 0.09 | ✅ tient |
| US500 | 520 | 69.0% | 1.27 | 0.06 | 58 | 63.8% | 1.26 | 0.07 | ✅ tient |
| GBPUSD | 171 | 59.1% | 0.96 | -0.01 | 60 | 63.3% | 1.62 | 0.12 | ⚠️ affaibli |
| USDJPY | 322 | 63.0% | 1.11 | 0.03 | 45 | 57.8% | 1.03 | 0.01 | ⚠️ affaibli |
| XAUUSD | 534 | 61.8% | 1.01 | 0.00 | 53 | 73.6% | 2.62 | 0.20 | ✅ tient* |
| EURUSD | 242 | 57.0% | 0.84 | -0.05 | 67 | 64.2% | 1.24 | 0.06 | ⚠️ affaibli |
| GER40 | 446 | 63.5% | 1.02 | 0.00 | 51 | 64.7% | 1.03 | 0.01 | ✅ tient* |

**\* XAUUSD/GER40 (2026-09-17, ajoutés à la demande d'Esdras "je veux diversifier") : le verdict mécanique "✅ tient" est TROMPEUR ici et ne doit pas être pris au pied de la lettre.** La règle (`trainExp > 0`) valide dès que l'espérance train est positive, même infinitésimalement — elle ne distingue pas un vrai edge d'un bruit statistique. Les valeurs EXACTES (non arrondies) : XAUUSD trainExp=**0.0019R** (PF train 1.007 — un pile ou face qui couvre à peine ses coûts), GER40 trainExp=**0.0045R** (PF train 1.018). Ce sont des chiffres indiscernables de zéro, pas un edge mesurable. Le test XAUUSD (+0.20R) est donc porté par une période chanceuse, pas par un mécanisme qui a fait ses preuves en train — exactement la signature "train ne passe pas la barre, test flatteur" que ce document traite ailleurs comme du bruit (voir le cas GBPUSD, section RSI(2) Connors du HANDOFF). **Conclusion révisée : ni XAUUSD ni GER40 ne tiennent réellement — RSI(2) Connors reste limité à US100/US500, comme documenté avant cette extension.**