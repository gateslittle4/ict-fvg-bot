#!/usr/bin/env bash
# downloadAllRealM1Parallel.sh - comme downloadAllRealM1.sh mais 2 paires EN MEME TEMPS (deux fois plus vite, un peu plus de charge sur le serveur).
# Usage : ADMIN_EXPORT_TOKEN='...' bash scripts/downloadAllRealM1Parallel.sh
# Reprend la ou le script sequentiel s'est arrete (dossier data/real-m1-history-v2). Arret d'urgence : Ctrl+C (les fichiers finis sont gardes).
# Chaque fichier est ecrit en .part puis renomme : un telechargement interrompu ne laisse jamais un fichier a moitie plein passer pour termine.
set -u
BASE="https://ict-fvg-bot.onrender.com/api/accounts/default/admin/export-candles"
OUT="${OUT_DIR:-data/real-m1-history-v2}"
[ -z "${ADMIN_EXPORT_TOKEN:-}" ] && { echo "Token vide, arret."; exit 1; }
CODE=$(curl -s -m 60 -o /dev/null -w "%{http_code}" "$BASE?symbol=EURUSD&timeframe=M1&days=1&token=$ADMIN_EXPORT_TOKEN")
[ "$CODE" != "200" ] && { echo "Token refuse ou serveur indisponible (HTTP $CODE)."; exit 1; }
echo "Token accepte."
mkdir -p "$OUT"
# le sequentiel a pu etre interrompu au milieu d'un fichier : on retire le plus recent (il sera retelecharge) et les vides
find "$OUT" -name '*.csv' -size -100k -delete
NEWEST=$(find "$OUT" -name '*.csv' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
[ -n "$NEWEST" ] && { echo "Retire le plus recent (peut-etre incomplet) : $NEWEST"; rm -f "$NEWEST"; }

one_symbol() {  # un symbole : remonte les tranches jusqu'a 2 vides de suite
  sym="$1"; empty=0
  for SKIP in $(seq 0 245 5000); do
    dir="$OUT/skip-$SKIP"; mkdir -p "$dir"
    if [ -s "$dir/$sym.csv" ]; then empty=0; echo "skip=$SKIP $sym : deja la"; continue; fi
    hdr=$(mktemp)
    curl -s -m 300 -D "$hdr" -o "$dir/$sym.csv.part" "$BASE?symbol=$sym&timeframe=M1&days=245&skip=$SKIP&token=$ADMIN_EXPORT_TOKEN"
    st=$(head -1 "$hdr" | tr -d '\r'); cnt=$(grep -i '^x-candle-count' "$hdr" | tr -d '\r' | awk '{print $2}'); first=$(grep -i '^x-first-candle' "$hdr" | tr -d '\r' | awk '{print $2}'); rm -f "$hdr"
    echo "skip=$SKIP $sym : $st | ${cnt:-0} bougies | debut ${first:--}"
    if [ "${cnt:-0}" -gt 1000 ] 2>/dev/null; then mv "$dir/$sym.csv.part" "$dir/$sym.csv"; empty=0
    else rm -f "$dir/$sym.csv.part"; empty=$((empty+1)); [ "$empty" -ge 2 ] && { echo "$sym : plus d'historique au-dela de skip=$SKIP"; break; }; fi
  done
}
export -f one_symbol; export BASE OUT ADMIN_EXPORT_TOKEN
printf '%s\n' EURUSD XAUUSD US100 US500 GER40 | xargs -P 2 -I{} bash -c 'one_symbol {}'
find "$OUT" -type d -empty -delete
echo "Termine."; ls "$OUT"
