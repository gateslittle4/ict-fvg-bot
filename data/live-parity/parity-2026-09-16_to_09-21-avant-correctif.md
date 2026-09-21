# Contrôle direct / rejeu — 2026-09-16 16:30 → 2026-09-21 01:00 UTC

Signaux propres au rejeu (moteur sur bougies complètes) : **11** · traités en direct : **7** · **concordants : 2** · manquants en direct : **9** · en direct mais pas au rejeu : **5**.

## Manquants en direct (le moteur aurait dû traiter)

| Heure UTC | Paire | Mécanisme | Sens |
|---|---|---|---|
| 2026-09-16 17:15 | GER40 | silverbullet | buy |
| 2026-09-17 14:00 | US500 | fvg | buy |
| 2026-09-17 14:45 | US500 | fvg | buy |
| 2026-09-17 20:00 | US500 | divergence | buy |
| 2026-09-18 06:30 | GER40 | breakerblock | buy |
| 2026-09-18 20:00 | US500 | divergence | buy |
| 2026-09-18 20:15 | GER40 | silverbullet | sell |
| 2026-09-20 22:15 | US100 | nwog | buy |
| 2026-09-20 22:15 | GER40 | nwog | buy |

## En direct mais absents du rejeu

| Heure UTC | Paire | Mécanisme | Sens | Raison au rejeu |
|---|---|---|---|---|
| 2026-09-17 14:00 | US500 | divergence | buy | bloqué : netting |
| 2026-09-17 15:15 | US100 | silverbullet | buy | aucun signal |
| 2026-09-18 11:00 | US500 | divergence | buy | bloqué : netting |
| 2026-09-18 14:45 | GER40 | silverbullet | sell | aucun signal |
| 2026-09-18 15:15 | US100 | silverbullet | sell | aucun signal |

## Comment lire

- **Manquants** : signal valide au rejeu sans trace d'ordre. Causes connues : serveur endormi/redémarré (voir `docs/LIVE_DATA_FLOW.md`), historique live faussé (corrigé le 2026-09-21), auto-exécution coupée, ou blocage réel chez le broker. Vérifier d'abord les journaux Render autour de l'heure.
- **Absents du rejeu** : le bot a traité un signal que le moteur complet ne voit pas (bougies fausses en direct, ou croyance de position différente : `netting`).
- Le rejeu ne connaît pas les positions réelles du broker : un `netting` au rejeu peut être un faux écart. Tolérance d'heure : 3 minutes.