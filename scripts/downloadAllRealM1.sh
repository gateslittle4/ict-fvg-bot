#!/usr/bin/env bash
# downloadAllRealM1.sh - remonte tout l'historique M1 que le broker (FP Markets via cTrader) accepte de donner, par tranches de 245 jours.
# Usage : bash scripts/downloadAllRealM1.sh          (le token est demande au clavier ou pris dans ADMIN_EXPORT_TOKEN)
# Sortie : data/real-m1-history/skip-<N>/<PAIRE>.csv (N = jours en arriere ; commence a skip-0).
# Arret : quand une tranche revient vide ou en erreur pour EURUSD (2 fois de suite), ou a skip 5000. Reprend la ou il s'est arrete.
set -u
BASE="https://ict-fvg-bot.onrender.com/api/accounts/default/admin/export-candles"
OUT="${OUT_DIR:-data/real-m1-history-v2}"   # v2 = fenetres de 8 jours (les v1 avaient des trous)
SYMS="EURUSD XAUUSD US100 US500 GER40"

if [ -z "${ADMIN_EXPORT_TOKEN:-}" ]; then read -rsp "Token admin (colle-le puis Entree) : " ADMIN_EXPORT_TOKEN; echo; fi
[ -z "$ADMIN_EXPORT_TOKEN" ] && { echo "Token vide, arret."; exit 1; }
CODE=$(curl -s -m 60 -o /dev/null -w "%{http_code}" "$BASE?symbol=EURUSD&timeframe=M1&days=1&token=$ADMIN_EXPORT_TOKEN")
[ "$CODE" != "200" ] && { echo "Token refuse ou serveur indisponible (HTTP $CODE)."; exit 1; }
echo "Token accepte."

empty_in_a_row=0
for SKIP in $(seq ${START_SKIP:-0} 245 5000); do
  DIR="$OUT/skip-$SKIP"; mkdir -p "$DIR"
  got_any=0
  for sym in $SYMS; do
    if [ -s "$DIR/$sym.csv" ] && [ "$(wc -l < "$DIR/$sym.csv")" -gt 1000 ]; then echo "skip=$SKIP $sym : deja telecharge"; got_any=1; continue; fi
    for TRY in 1 2 3; do
      HDR=$(mktemp)
      curl -s -m 300 -D "$HDR" -o "$DIR/$sym.csv" "$BASE?symbol=$sym&timeframe=M1&days=245&skip=$SKIP&token=$ADMIN_EXPORT_TOKEN"
      STATUS=$(head -1 "$HDR" | tr -d '\r'); COUNT=$(grep -i '^x-candle-count' "$HDR" | tr -d '\r' | awk '{print $2}'); FIRST=$(grep -i '^x-first-candle' "$HDR" | tr -d '\r' | awk '{print $2}')
      rm -f "$HDR"
      echo "skip=$SKIP $sym : $STATUS | ${COUNT:-0} bougies | debut ${FIRST:--} (essai $TRY)"
      [ "${COUNT:-0}" -gt 1000 ] 2>/dev/null && break
      echo "   reponse du serveur : $(head -c 200 "$DIR/$sym.csv" | tr '\n' ' ')"
      sleep 8
    done
    if [ "${COUNT:-0}" -gt 1000 ] 2>/dev/null; then got_any=1; else rm -f "$DIR/$sym.csv"; fi
  done
  if [ "$got_any" = 0 ]; then rmdir "$DIR" 2>/dev/null; empty_in_a_row=$((empty_in_a_row+1)); else empty_in_a_row=0; fi
  if [ "$empty_in_a_row" -ge 2 ]; then echo "Plus d'historique au-dela de skip=$SKIP : fin."; break; fi
done
echo "Termine. Dossiers :"; ls "$OUT"
