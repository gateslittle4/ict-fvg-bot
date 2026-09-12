# FVG : la bougie immédiate (< 15 min après formation) compte-t-elle vraiment comme un retest ?

⚠ Claim directe d'Esdras : un retest sur la TOUTE PREMIÈRE bougie après formation (< 15 min) ne devrait pas compter comme un vrai retour - c'est le même mouvement de continuation qui mèche en arrière, pas un vrai "parti puis revenu". Vérifié avant de coder quoi que ce soit : 44-53% de TOUS les trades validés actuellement (production, train) viennent exactement de cette première bougie - près de la moitié du volume du bot. Les deux cohortes (bougie immédiate vs plus tard) sont ici séparées et comparées directement, même moteur/config de production, zéro paramètre retouché.

| Symbole | Cohorte | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|
| US100 | bougie immédiate (<15min) | 33 | 0.91 | 13 | 0.80 | ✅ tient |
| US100 | bougie(s) suivante(s) | 35 | 1.82 | 25 | 1.78 | ✅ tient |
| US500 | bougie immédiate (<15min) | 42 | 1.03 | 13 | 0.85 | ✅ tient |
| US500 | bougie(s) suivante(s) | 28 | 1.02 | 17 | 1.35 | ✅ tient |
| XAUUSD | bougie immédiate (<15min) | 44 | 0.49 | 19 | 1.06 | ✅ tient |
| XAUUSD | bougie(s) suivante(s) | 38 | 1.34 | 22 | 0.22 | ⚠️ affaibli |