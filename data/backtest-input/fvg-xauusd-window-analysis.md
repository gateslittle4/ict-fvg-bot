# XAUUSD — fenêtre horaire (8h-12h vs 7h-10h vs journée entière), moteur single-touch PRODUCTION

Question directe d'Esdras (2026-09-12), après la vérification US500 : "teste XAUUSD aussi sur 8h-12h." XAUUSD tourne sur 7h-10h (London-NY overlap) en production, PAS 10h-11h comme US100/US500 - c'est sa vraie fenêtre de référence ici, pas un choix arbitraire pour la comparaison. Pas de multi-contact validé sur XAUUSD non plus - moteur single-touch réel, config verbatim (stop `swing`, RR=4), seule la fenêtre change.

| Fenêtre | Trades train | Espérance train (R) | Trades test | Espérance test (R) | R total test | Drawdown max test (R) | Verdict |
|---|---|---|---|---|---|---|---|
| 08h-12h | 145 | 0.24 | 76 | 0.46 | 34.59 | 11.26 | ✅ tient |
| 07h-10h (production actuelle) | 82 | 0.88 | 41 | 0.61 | 24.93 | 6.20 | ✅ tient |
| toute la journée (pas de fenêtre) | 455 | 0.12 | 194 | 0.22 | 43.23 | 27.81 | ✅ tient |

**Verdict pour XAUUSD** : 7h-10h reste meilleur ou équivalent en espérance test (0.46R vs 0.61R). 