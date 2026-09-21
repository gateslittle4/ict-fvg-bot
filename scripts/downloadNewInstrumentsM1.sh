#!/usr/bin/env bash
# downloadNewInstrumentsM1.sh - etape 1 + 2 du pre-enregistrement `prereg-new-instruments-2026-09-21` :
#  1) liste les symboles du broker qui ressemblent a l'argent / au Dow Jones / au petrole et choisit UN nom par famille (nom exact prefere) ;
#  2) telecharge leur M1 (tranches de 245 jours, remonte jusqu'a 2 tranches vides de suite), UN symbole a la fois, avec pause si le serveur ralentit.
# Usage : ADMIN_EXPORT_TOKEN='...' bash scripts/downloadNewInstrumentsM1.sh
# Sortie : data/real-m1-new/skip-N/<SYMBOLE>.csv ; data/real-m1-new/chosen-symbols.txt ; data/real-m1-new/all-candidates.json
set -u
BASE="https://ict-fvg-bot.onrender.com/api/accounts/default/admin"
OUT="data/real-m1-new"; mkdir -p "$OUT"
[ -z "${ADMIN_EXPORT_TOKEN:-}" ] && { echo "Token vide, arret."; exit 1; }
T="$ADMIN_EXPORT_TOKEN"

echo "== Etape 1 : symboles candidats =="
: > "$OUT/all-candidates.json"
for f in XAG US30 DJ WS30 OIL WTI BRENT XTI; do
  curl -s -m 60 "$BASE/list-symbols?token=$T&filter=$f" > "$OUT/list-$f.json"
  echo "filtre $f : $(python3 -c "import json;d=json.load(open('$OUT/list-$f.json'));print(d.get('count'),[s['name'] for s in d.get('symbols',[])][:12], d.get('error',''))" 2>&1)"
  cat "$OUT/list-$f.json" >> "$OUT/all-candidates.json"; echo >> "$OUT/all-candidates.json"
done
pick() {  # pick <fichiers...> -- <noms preferes dans l'ordre>
  python3 - "$OUT" "$@" <<'PY'
import sys,json,glob
out=sys.argv[1]; prefs=sys.argv[2:]
names=set()
for f in glob.glob(out+'/list-*.json'):
    try: names |= {s['name'] for s in json.load(open(f)).get('symbols',[])}
    except Exception: pass
for p in prefs:
    if p in names: print(p); break
PY
}
XAG=$(pick XAGUSD)
US30=$(pick US30 DJ30 WS30 DJI30 US30.cash USA30)
OIL=$(pick USOIL XTIUSD WTI WTIUSD CRUDEOIL USOUSD UKOIL)
echo "Choisis : argent='${XAG:-AUCUN}'  dow='${US30:-AUCUN}'  petrole='${OIL:-AUCUN}'"
printf '%s\n' "$XAG" "$US30" "$OIL" | sed '/^$/d' > "$OUT/chosen-symbols.txt"
[ -s "$OUT/chosen-symbols.txt" ] || { echo "Aucun symbole trouve : colle-moi la sortie ci-dessus."; exit 1; }

echo "== Etape 2 : telechargement M1 (un symbole a la fois) =="
guard() {  # ralentit si le serveur est charge (il partage 512 Mo avec le bot)
  for k in 1 2 3 4; do
    ms=$(curl -s -m 20 -o /dev/null -w "%{time_total}" "https://ict-fvg-bot.onrender.com/healthz" | awk '{printf "%d", $1*1000}')
    [ "${ms:-99999}" -lt 6000 ] && return 0
    echo "   serveur lent (${ms} ms), pause 20 s"; sleep 20
  done
}
while read -r SYM; do
  empty=0
  for SKIP in $(seq 0 245 5000); do
    DIR="$OUT/skip-$SKIP"; mkdir -p "$DIR"
    if [ -s "$DIR/$SYM.csv" ] && [ "$(wc -l < "$DIR/$SYM.csv")" -gt 1000 ]; then echo "$SYM skip=$SKIP : deja la"; empty=0; continue; fi
    got=0
    for TRY in 1 2 3; do
      guard
      HDR=$(mktemp)
      curl -s -m 300 -D "$HDR" -o "$DIR/$SYM.csv" "$BASE/export-candles?symbol=$SYM&timeframe=M1&days=245&skip=$SKIP&token=$T"
      ST=$(head -1 "$HDR" | tr -d '\r'); CNT=$(grep -i '^x-candle-count' "$HDR" | tr -d '\r' | awk '{print $2}'); FIRST=$(grep -i '^x-first-candle' "$HDR" | tr -d '\r' | awk '{print $2}'); rm -f "$HDR"
      echo "$SYM skip=$SKIP : $ST | ${CNT:-0} bougies | debut ${FIRST:--} (essai $TRY)"
      if [ "${CNT:-0}" -gt 1000 ] 2>/dev/null; then got=1; break; fi
      case "$ST" in *200*) break ;; esac   # 200 mais vide = plus d'historique, inutile de reessayer
      echo "   reponse : $(head -c 160 "$DIR/$SYM.csv" | tr '\n' ' ')"; sleep 8
    done
    if [ "$got" = 1 ]; then empty=0; else rm -f "$DIR/$SYM.csv"; empty=$((empty+1)); [ "$empty" -ge 2 ] && { echo "$SYM : plus d'historique au-dela de skip=$SKIP"; break; }; fi
  done
done < "$OUT/chosen-symbols.txt"
find "$OUT" -type d -empty -delete
echo "Termine. Symboles : $(tr '\n' ' ' < "$OUT/chosen-symbols.txt")"; ls "$OUT"
