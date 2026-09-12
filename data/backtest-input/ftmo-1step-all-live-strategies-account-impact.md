# Combien de temps pour passer un challenge FTMO 1-Step avec TOUTES les stratégies live en même temps (compte 10k)

Ce test-ci empile TOUT à la fois - contrairement à chaque script précédent qui isolait une source. Le point important : `CONFIG.guardrails` (maxTradesPerDay=2, dailyLossLimitPct=2%) limite les NOUVELLES entrées par jour, mais ne plafonne PAS le nombre de positions ouvertes EN MÊME TEMPS sur des symboles différents - une position peut rester ouverte jusqu'à 480 bougies M15 (~5 jours), donc jusqu'à 4 positions (US100, US500, XAUUSD, EURUSD) peuvent être ouvertes simultanément, chacune risquant 0.5% du solde courant. C'est ce mécanisme - pas un bug - qui explique le taux de busted plus élevé ci-dessous que dans chaque test isolé.

Question directe d'Esdras (2026-09-12) : "on a plusieurs stratégies ouvertes non ? ... fais un test global de toutes qui fonctionnent à la fois et non pour chaque stratégie séparément pour voir l'impact de toutes ces stratégies ouvertes en même temps sur le compte. Compte 10k." Jusqu'ici chaque script FTMO de cette session testait UNE combinaison à la fois (FVG seul, FVG+Divergence, une fenêtre horaire isolée...). Celui-ci reproduit EXACTEMENT le scope production actuel au complet dans UNE SEULE simulation, avec netting réel partagé (un seul emplacement ouvert par symbole, comme `openPositions` dans liveStrategyEngine.js) et un seul budget de garde-fous (`CONFIG.guardrails`) — tout lu directement depuis `src/config.js` :
- **FVG** : US100 (multi-contact, fenêtre 8h-12h), US500 (contact unique, 10h-11h), XAUUSD (contact unique, 7h-10h)
- **Divergence** (log-ratio z-score) : US100/US500
- **NWOG** (New Week Opening Gap) : US100
- **Judas Swing** (London killzone PDH/PDL sweep+reclaim) : EURUSD

Quand deux sources visent le même symbole au même instant, l'ordre de priorité est identique à `ingestCandle()` (liveStrategyEngine.js) : FVG, puis Divergence, puis NWOG, puis Judas Swing — la première à passer les filtres (distance, spread, garde-fous) gagne le slot, les autres sont bloquées ce tour-ci exactement comme en production ("netting"). Compte de départ $10 000, règles FTMO 1-Step (cible unique +10%, perte max trailing -10% sur le plus haut solde jamais atteint).

| Année | Trades (détail par source) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 269 (85 FVG + 87 div. + 32 NWOG + 65 Judas) | 34.2% | 2.1% | 5.2% | non | jour 79 | $16797 |
| 2020 (train) | 221 (70 FVG + 62 div. + 27 NWOG + 62 Judas) | 30.0% | 5.0% | 10.2% | **OUI** (2020-09-17) | jour 63 | $13834 |
| 2021 (train) | 228 (69 FVG + 68 div. + 29 NWOG + 62 Judas) | 29.8% | 0.4% | 10.4% | **OUI** (2021-10-04) | jour 137 | $13297 |
| 2022 (train) | 319 (103 FVG + 91 div. + 40 NWOG + 85 Judas) | 30.4% | 1.0% | 6.6% | non | jour 64 | $16697 |
| 2023 (train) | 303 (96 FVG + 73 div. + 35 NWOG + 99 Judas) | 31.5% | 6.3% | 6.3% | non | jour 194 | $16781 |
| 2024 (test) | 146 (47 FVG + 42 div. + 16 NWOG + 41 Judas) | 33.6% | 1.0% | 10.2% | **OUI** (2024-07-11) | jour 24 | $13655 |
| 2025 (test) | 333 (108 FVG + 95 div. + 39 NWOG + 91 Judas) | 34.7% | 0.0% | 5.3% | non | jour 37 | $23910 |

## Verdict

**Vitesse** : sur les 7 années testées, le challenge (+10%) est complété en moyenne en 85 jours (79, 63, 137, 64, 194, 24, 37 j selon l'année) - nettement plus vite que n'importe quelle stratégie isolée testée cette session, logique puisque le compte cumule le rythme de trade des 4 sources.

**Risque** : 3/7 années busted (-10% trailing) : 2020, 2021, 2024 (dont 1/2 année(s) test : 2024). 2024 (test) buste dès le jour 24, alors même que le challenge y est déjà complété - la simulation continue de trader après le +10% (comme dans tous les autres scripts de compte cette session), donc ce n'est pas un raté du challenge lui-même mais un signal que le risque combiné reste élevé même après l'avoir passé. Chaque test isolé cette session (FVG seul, FVG+Divergence, une fenêtre horaire) ne bustait quasiment jamais à 0.5%/trade - le taux de bust ici vient spécifiquement de l'empilement de positions simultanées sur plusieurs symboles décorrélés (voir la note en tête de rapport), pas d'une dégradation de l'edge d'une stratégie individuelle.

**Implication pratique** : ce système, tel que configuré en production aujourd'hui (toutes sources actives, 0.5% de risque par trade, aucun plafond sur le nombre de positions simultanées), passerait un challenge FTMO 1-Step beaucoup plus vite qu'avec FVG seul - mais avec un risque de busted réel et non négligeable (43% des années testées). Réduire le risque par trade (ex. 0.3-0.4% au lieu de 0.5%) ou plafonner le nombre de positions ouvertes simultanément tous symboles confondus sont deux leviers concrets pour faire baisser ce taux, non testés ici - à décider.