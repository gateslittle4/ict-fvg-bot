# FVG (config US100 verbatim, contact unique ET multi-contact) sur EURUSD/GBPUSD/USDJPY

⚠ Ni GBPUSD ni EURUSD n'ont de config FVG validée en production - déjà testés et rejetés plus tôt dans ce projet (voir config.js). Donc pas de config "déjà validée" à étendre ici comme pour l'extension USDJPY à 11 mécanismes - la config US100 (H4_EMA200, structure+sweep actifs, fenêtre Silver Bullet 10h-11h NY, stop fvg-edge, RR=5) est reprise TELLE QUELLE sur les 3 paires, zéro paramètre ajusté par paire, pour rester honnête. Contact unique = jamais testé sur ces paires avant (nouvelle référence, pas juste la colonne multi-contact). Écran TRAIN (2019-2023) / vérification TEST (2024-2025).

| Paire | Mécanisme | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|
| EURUSD | contact unique | 34 | -0.55 | 15 | -0.25 | ❌ ne tient pas |
| EURUSD | **multi-contact** | 74 | 0.02 | 35 | -0.25 | ❌ ne tient pas |
| GBPUSD | contact unique | 29 | -0.38 | 10 | 0.19 | ⚠️ affaibli |
| GBPUSD | **multi-contact** | 55 | -0.33 | 24 | 0.03 | ⚠️ affaibli |
| USDJPY | contact unique | 48 | -0.12 | 16 | 0.73 | ⚠️ affaibli |
| USDJPY | **multi-contact** | 116 | 0.09 | 32 | 1.06 | ✅ tient |