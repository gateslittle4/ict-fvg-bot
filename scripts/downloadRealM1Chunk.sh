#!/usr/bin/env bash
# downloadRealM1Chunk.sh - telecharge une tranche de 245 jours de bougies M1 du broker (FP Markets via le bot sur Render).
# Usage : bash scripts/downloadRealM1Chunk.sh [skip] [dossier]   (defaut : skip=245, data/real-m1-2025)
# Le token admin est demande au clavier (saisie masquee) ; il n'est jamais ecrit dans un fichier.
set -u
SKIP="${1:-245}"
OUT="${2:-data/real-m1-2025}"
BASE="https://ict-fvg-bot.onrender.com/api/accounts/default/admin/export-candles"

if [ -z "${ADMIN_EXPORT_TOKEN:-}" ]; then
  read -rsp "Token admin (colle-le puis Entree) : " ADMIN_EXPORT_TOKEN
  echo
fi
if [ -z "$ADMIN_EXPORT_TOKEN" ]; then echo "Token vide, arret."; exit 1; fi

# Test rapide du token sur une toute petite fenetre avant de lancer les gros telechargements.
CODE=$(curl -s -m 60 -o /dev/null -w "%{http_code}" "$BASE?symbol=EURUSD&timeframe=M1&days=1&token=$ADMIN_EXPORT_TOKEN")
if [ "$CODE" != "200" ]; then
  echo "Le serveur repond HTTP $CODE au test du token."
  [ "$CODE" = "403" ] && echo "403 = token refuse : verifie la valeur dans Render (Environment > ADMIN_EXPORT_TOKEN), sans espace ni guillemet."
  exit 1
fi
echo "Token accepte."

mkdir -p "$OUT"
for sym in EURUSD XAUUSD US100 US500 GER40; do
  HDR=$(mktemp)
  curl -s -m 240 -D "$HDR" -o "$OUT/$sym.csv" "$BASE?symbol=$sym&timeframe=M1&days=245&skip=$SKIP&token=$ADMIN_EXPORT_TOKEN"
  STATUS=$(head -1 "$HDR" | tr -d '\r')
  COUNT=$(grep -i '^x-candle-count' "$HDR" | tr -d '\r')
  FIRST=$(grep -i '^x-first-candle' "$HDR" | tr -d '\r')
  echo "$sym : $STATUS | $COUNT | $FIRST | $(wc -l < "$OUT/$sym.csv") lignes"
  rm -f "$HDR"
done
