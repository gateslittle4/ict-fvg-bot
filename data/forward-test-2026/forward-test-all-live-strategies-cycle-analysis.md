# Combien de cycles de +10% sur les 7 mois de forward-test réel (US100+US500+XAUUSD, sans EURUSD)

Esdras, juste après avoir basculé `ACCOUNT_MODE=live` sur Render : "dis-moi combien de cycle de 10% j'aurais eu pendant les 7 mois que tu as les données là." Même méthode reset-au-+10%/bust que le test combiné (voir ftmo-1step-all-live-strategies-cycle-account-impact.md), mais appliquée aux vraies données forward-test (export cTrader réel, 2026-02-05 → 2026-09-09) au lieu de l'historique 2018-2025 - une vraie période out-of-sample qui n'a jamais servi à choisir cette config.

**Différence de scope à noter** : `data/forward-test-2026/` n'a pas d'export EURUSD, donc **Judas Swing est exclu ici** (pas de bug, pas de données pour le simuler) - ce test couvre FVG (US100 multi-contact 8h-12h, US500 10h-11h, XAUUSD 7h-10h) + Divergence (US100/US500) + NWOG (US100) seulement.

Deux risques comparés : 0.5% (la config qui a réellement tourné pendant ces 7 mois, puisque le mode "live"/0.3% vient tout juste d'être activé aujourd'hui) et 0.3% (le nouveau défaut live), pour avoir la réponse historiquement exacte ET la projection avec le nouveau réglage.

| Risque par trade | Cycles totaux | Passes | Busts | Jours moy. pour passer |
|---|---|---|---|---|
| 0.5% (config réelle sur ces 7 mois) | 2 | 2 | 0 | 65 |
| 0.3% (nouveau défaut "live") | 1 | 1 | 0 | 109 |

## Détail cycle par cycle, à 0.5% (la config réellement active sur ces 7 mois)

| # | Période | Durée | Trades | Win rate | Drawdown trailing max | Résultat |
|---|---|---|---|---|---|---|
| 1 | 2026-02-05 → 2026-04-21 | 75j | 36 | 33.3% | 0.0% | ✅ pass |
| 2 | 2026-04-21 → 2026-06-14 | 55j | 35 | 34.3% | 0.0% | ✅ pass |

## Verdict

Sur ces 7 mois réels, à 0.5% (la config qui a réellement tourné) : **2 cycle(s)**, 2 passe(s) et 0 bust(s). À 0.3% (nouveau défaut live) : 1 cycle(s), 1 passe(s), 0 bust(s). Rappel : Judas Swing (EURUSD) est absent de ce test faute de données forward-test pour cette paire - le chiffre réel (avec Judas Swing) serait probablement un peu plus rapide, comme dans le test combiné complet.