# US500 — fenêtre horaire (8h-12h vs 10h-11h vs journée entière), moteur single-touch PRODUCTION

Question directe d'Esdras (2026-09-12) juste après le déploiement de la fenêtre 8h-12h sur US100 : "US500 n'a jamais été testé sur 8h-12h ? Sinon teste-le." Contrairement à US100, US500 n'a jamais eu de multi-contact validé (`CONFIG.fvg.perSymbol.US500.multiTouch` n'existe pas) - donc ce test reprend le moteur single-touch RÉELLEMENT en production pour US500 aujourd'hui (config verbatim, seule la fenêtre change), pas une version hypothétique jamais validée.

| Fenêtre | Trades train | Espérance train (R) | Trades test | Espérance test (R) | R total test | Drawdown max test (R) | Verdict |
|---|---|---|---|---|---|---|---|
| 08h-12h | 205 | 0.57 | 91 | 0.62 | 56.25 | 14.21 | ✅ tient |
| 10h-11h (production actuelle) | 70 | 1.02 | 30 | 1.13 | 33.97 | 10.42 | ✅ tient |
| toute la journée (pas de fenêtre) | 546 | 0.37 | 227 | 0.39 | 88.32 | 15.63 | ✅ tient |

**Verdict pour US500** : 10h-11h reste meilleur ou équivalent en espérance test (0.62R vs 1.13R). 