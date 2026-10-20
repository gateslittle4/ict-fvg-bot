# Revue à l'aveugle, lot 4 — achats de continuation (tendance H4 haussière, sans balayage de low H4)

Revue du 2026-10-06. 10 achats US100 tirés au hasard sur 2023–2025 (3/3/4 par année, graine fixe, ordres remplis seulement). Règles du bot : stop c1 − 3 pts, TP max(½ cible, 3R), entrée 50 %.

| # | Sa décision | Sa raison | Issue (stop c1 / TP bot) |
|---|---|---|---|
| 1 | laisse | déjà entré dans le FVG M15 à gauche : plus d'aimant | −1R |
| 2 | prend | low H4 et FVG H4 pris il y a quelques jours (tendance continue) + liquidity sweep ce matin | −1R |
| 3 | prend | sûrement une news, impulsion pareille | −1R |
| 4 | prend | prix entré dans un FVG H4 hier, setup attendu aujourd'hui | −1R |
| 5 | prend | (pas de raison donnée) | +3R |
| 6 | laisse | (pas de raison donnée) | +3R |
| 7 | laisse | on est toujours dans un FVG H4 haussier | −1R |
| 8 | laisse | le dernier PD array touché était un high H4 | −1R |
| 9 | hésite | | −1R |
| 10 | laisse | même chose que 7 | −1R |

## Mesure
- Ses prises : 4 trades, 1 gagnant, 0 R au total. Ses refus : 5 trades, 1 gagnant, −1 R. L'hésitation (9) : −1 R. 2 gagnants sur 10 : aucune séparation, échantillon trop petit.
- Test d'un proxy codé : « entrée à l'intérieur d'un FVG H4 haussier non rempli » = elle laisse (7, 10) mais elle a pris le 5 (dedans aussi) : le proxy ne reproduit pas ses décisions.

## Critères qu'elle a énoncés (à préciser avant de coder)
1. FVG M15 à gauche déjà touché = pas d'aimant, pas de trade.
2. Biais = type du DERNIER PD array touché (low H4 / FVG H4 haussier = achats ; high H4 = pas d'achat).
3. Setup valable le lendemain du toucher d'un FVG H4 tant que le setup n'a pas eu lieu.
4. Impulsion de news acceptée.
5. 7 / 10 : « toujours dans un FVG H4 haussier » (sens exact à confirmer : toujours dedans = pas de réaction ?).
