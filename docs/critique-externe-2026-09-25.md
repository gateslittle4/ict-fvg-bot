# Dossier à faire critiquer — bot de trading ICT (US100 / US500), 25 septembre 2026

## Ce que je te demande (à l'IA qui lit ce document)

Tu es un chercheur quantitatif expérimenté et sceptique. Ce dossier décrit un robot de trading et la méthode utilisée pour
le tester. **Ne me félicite pas : cherche les erreurs.** En particulier :

1. Y a-t-il un biais qui gonfle les résultats (regard vers le futur, sur-ajustement, tests multiples, survivant, coûts sous-estimés) ?
2. Les conclusions tirées de chaque test sont-elles justifiées par les chiffres, ou trop fortes / trop faibles ?
3. La méthode de validation (règles écrites avant le calcul, entraînement / test) est-elle solide ? Où fuit-elle ?
4. La simulation du challenge FTMO est-elle réaliste ? Qu'est-ce qui manque ?
5. Qu'aurais-tu testé à la place, et dans quel ordre ?

Classe tes remarques de la plus grave à la moins grave et dis, pour chacune, ce qu'il faudrait vérifier concrètement.

---

## 1. Le robot

- Code Node.js, compte démo cTrader (courtier FP Markets), objectif : passer le challenge **FTMO 1-Step** (+10 % sans perdre
  10 % depuis le plus haut solde de fin de journée ; perte du jour max 3 % ; aucun jour > 50 % du gain total).
- Instruments : **US100** (Nasdaq-100) et **US500** (S&P 500) en CFD. Risque : 0,3 % par trade en démo, 0,5 % prévu en challenge.
- Stratégies en service (« le combo ») :

| Stratégie | Paire | Idée |
|---|---|---|
| Divergence | US100 / US500 | quand l'écart entre les deux indices s'étire (z-score), achat du retardataire |
| NWOG | US100 | trou d'ouverture du dimanche, achat seulement |
| Weekly Sweep | US500 | prise de liquidité au-delà du plus haut / plus bas de la semaine, puis retournement |
| Silver Bullet | US100, US500 | fenêtre 10 h – 11 h New York, FVG (déséquilibre) après prise de liquidité, cible 3R |
| CBDR | US100 | range de la banque centrale (fin de journée), cassure / retournement |
| RSI(2) journalier | US500 | achat quand RSI(2) très bas au-dessus de la moyenne 200 jours |
| A — ORB 5 min | US100 | cassure du range des 5 premières minutes de la séance, cible 10R, sortie à la clôture |
| B — zone de bruit | US500 | momentum intraday (sortie de la zone de bruit), sans cible |

- Règles communes : une seule position par paire, 3 trades par jour maximum, pause de 30 min après une perte, arrêt de la
  journée à −2 %. Un « filet de sécurité » arrête une stratégie si sa baisse depuis 2023 dépasse 1,5 × sa pire baisse 2010-2022
  (Silver Bullet US500 est arrêtée par cette règle depuis le 24/09/2026).

## 2. La méthode de test

- **Rejeu fidèle** : l'historique est rejoué avec la MÊME classe de code que le robot en direct (mêmes signaux, même règle
  d'entrée partagée, mêmes garde-fous), minute par minute : entrée au marché au prix suivant (achat = bid + spread), stop et
  objectif vérifiés minute par minute, stop d'abord si les deux sont touchés dans la même minute, un trou à travers le stop sort
  au prix d'ouverture (perte > 1R), swap du courtier compté.
- **Données** : M1 HistData 2010-2022, M1 du courtier 2023 → 21/09/2026. Spread constant par défaut (en % du prix), pas de
  glissement au-delà du spread.
- Rejoué en **8 tranches** de 3-4 ans, chacune avec 90 jours de préchauffage.
- **Protocole** : entraînement 2011-2022 (deux moitiés : 2011-2016 et 2017-2022), **test 2023-2025 lu une seule fois**,
  2026 descriptif. Pour une nouvelle stratégie : ≥ 60 trades, t ≥ 2 (2,2 à 2,6 si plusieurs hypothèses), les deux moitiés
  positives, test > 0.
- **Pré-enregistrement** : chaque test est écrit et commité (git) AVANT le calcul, avec son critère. Un amendement n'est permis
  que s'il est écrit avant de relancer, et il est déclaré (avec ce qui a déjà été vu).
- **Contrôle hebdomadaire** : chaque semaine, les trades réels sont comparés au rejeu fidèle de la même semaine (semaine du
  20/09 : 6 trades identiques, R réel +13,15 contre rejeu +12,24 sur le périmètre commun ; les écarts sont expliqués).

## 3. Résultats du combo (rejeu fidèle, sans A et B — elles ne sont pas encore dans les tranches)

| Période | Trades | R total | % gagnants | t |
|---|---|---|---|---|
| 2011-2016 | 1 772 | +39,3 R | 26 % | 0,52 |
| 2017-2022 | 1 976 | +296,2 R | 29 % | 3,50 |
| Test 2023-2025 | 1 040 | +21,6 R | 26 % | 0,38 |
| 2026 (→ 21/09) | 270 | −13,3 R | 25 % | −0,43 |

Par stratégie (R, mêmes périodes) :

| Stratégie | 2011-16 | 2017-22 | 2023-25 | 2026 |
|---|---|---|---|---|
| CBDR US100 | +40,0 | −13,3 | −8,6 | −7,6 |
| Divergence US100 | −38,8 | +12,6 | +28,8 | +5,3 |
| Divergence US500 | +12,9 | +42,6 | +21,5 | −3,4 |
| NWOG US100 | −6,4 | +53,9 | −7,4 | +10,2 |
| RSI(2) US500 | +1,5 | +0,5 | +3,0 | +1,2 |
| Silver Bullet US100 | +13,6 | +91,3 | −7,8 | −11,0 |
| Silver Bullet US500 | +32,2 | +57,6 | −20,2 | −17,4 |
| Weekly Sweep US500 | −15,7 | +51,0 | +12,3 | +9,5 |

**Remarque honnête** : l'essentiel du gain vient de 2017-2022. Hors de cette période, le combo est proche de zéro.
Les stratégies A et B ont été validées séparément (étude minute par minute, pré-enregistrée) :

| Stratégie | Entraînement 2010-2022 | Test 2023-2025 | 2026 |
|---|---|---|---|
| A — ORB 5 min US100 | 3 062 trades, +0,147 R/trade, t 3,22 (+203 R puis +247 R) | +106 R (t 1,55) | −28 R |
| B — zone de bruit US500 | 3 112 trades, +0,018 %/trade, t 2,43 | +15,7 % (t 1,53) | −4,9 % |

## 4. Tests récents (tous pré-enregistrés)

| Test | Résultat | Verdict |
|---|---|---|
| Filtre de tendance (achats seulement au-dessus de la moyenne 200 j, ventes en dessous) | Les trades retirés gagnaient +41,5 R (2011-16) et +92 R (2017-22) | Rejeté |
| Taille ÷ 2 en marché agité (ATR14 / moyenne 100 > 1,5) | En marché agité le combo gagne +0,365 R/trade contre +0,054 ailleurs ; le rapport gain / pire baisse baisse | Rejeté |
| Fermer les positions le vendredi 16 h 45 NY (sauf RSI(2)) | Réussite FTMO 2017-22 : 77 % → 71 % ; R 2017-22 +296 → +213 ; mais pire trade 2026 −9,5 → −1,2 R et test +22 → +48 R | Rejeté (critère : ne pas baisser la réussite FTMO sur les 2 moitiés et le test) |
| IBS (achat si clôture dans les 20 % bas du jour, au-dessus de la moyenne 200 j) | Entraînement 547 trades, t 3,42 ; test +13,9 R (t 2,99) | Validé (pas encore en service) |
| « 3 baisses de suite » | — | Rejeté |
| A gardée jusqu'au lendemain | 2011-16 −47,5 R | Rejeté |
| Market Maker Model ICT (version mécanique) | Trop peu de trades avec la règle stricte ; échec avec la règle élargie | Rejeté |
| Cible du Silver Bullet de 1:2 à 1:7 | Aucune cible ne bat 1:3 selon le critère | On garde 1:3 |

Incident trouvé et corrigé : dans le rejeu, un trade RSI(2) ouvert le 29/12/2016 n'était pas fermé à la fin de sa tranche et
courait jusqu'au stop de mars 2020 (−9 R). Corrigé : après la fin d'une tranche, le rejeu continue sans nouvelle entrée jusqu'à
la sortie normale des positions. Un autre défaut a été trouvé en testant la fermeture du vendredi (les données HistData
s'arrêtent souvent avant 16 h 45 le vendredi) ; corrigé par un amendement déclaré avant de relancer.

## 5. Simulation du challenge FTMO 1-Step

- Un départ chaque lundi de 2011 à 2026 (816 départs), à 0,5 % par trade (1R = 0,5 %) sur les trades du rejeu fidèle :
  cible +20R, perte max 20R sous le plus haut de fin de journée, perte du jour 6R, meilleur jour ≤ 50 % du gain.
- Soldes réalisés à la clôture des trades (pas de perte latente), jour FTMO approché par UTC + 1 h.

| Départs | Réussis | Bustés | Durée médiane |
|---|---|---|---|
| 2011-2016 | 49 % | 51 % | 120 j |
| 2017-2022 | 77 % | 23 % | 75 j |
| 2023-2025 | 42 % | 58 % | 93 j |
| Tout 2011-2026 | 57 % | 40 % | 86 j |

(À 1 % par trade : environ 20 % de réussite ; à 0,3 % : 60 % mais 7 mois.)

## 6. Limites connues (déjà identifiées)

- Spread constant, pas de glissement modélisé au-delà (en réel : jusqu'à ~10 points sur un stop US100 le 25/09).
- Pertes latentes ignorées dans la simulation FTMO (FTMO compte l'équité, pas seulement le solde réalisé).
- Beaucoup de stratégies testées au fil des mois (plus de 30 études) : le risque de trouver du hasard est réel, même avec le
  pré-enregistrement ; le combo actuel est le survivant de ces essais.
- Le test 2023-2025 a déjà été lu pour plusieurs décisions : il n'est plus vraiment « vierge ».
- 2026 est négatif pour le combo (marché haussier calme, peu favorable aux retournements et aux ventes).

---

## Questions précises

1. Le combo n'est vraiment positif que sur 2017-2022 (t 3,50) ; sur 2011-2016 et le test il est proche de zéro. Faut-il
   conclure qu'il n'a pas d'avantage, ou qu'il dépend du régime ? Comment le décider proprement ?
2. Le « filet de sécurité » (arrêt à 1,5 × la pire baisse historique) est-il une bonne règle, ou une façon de couper une
   stratégie juste avant qu'elle remonte ?
3. Notre simulation FTMO donne ~57 % de réussite. Qu'est-ce qui la rend probablement trop optimiste ?
4. Quel test ferais-tu en premier pour savoir si l'avantage du combo est réel ?
