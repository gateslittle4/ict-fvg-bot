import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

sigs = json.load(open(sys.argv[1])); outdir = sys.argv[2]

def candles(ax, cs, w=0.6):
    for i, k in enumerate(cs):
        up = k['c'] >= k['o']; col = '#1a9850' if up else '#d73027'
        ax.plot([i, i], [k['l'], k['h']], color=col, lw=0.8, zorder=3)
        ax.add_patch(Rectangle((i - w / 2, min(k['o'], k['c'])), w, max(abs(k['c'] - k['o']), 1e-6), facecolor=col, edgecolor=col, zorder=4))

for s in sigs:
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(13, 9.5), gridspec_kw={'height_ratios': [3, 1.6]})
    cs = s['m15']; n = len(cs)
    candles(a1, cs)
    lo = min(k['l'] for k in cs); hi = max(k['h'] for k in cs); span = hi - lo
    ylo = min(lo, s['stop']) - 0.05 * span; yhi = max(hi, 0) + 0.05 * span
    tp_off = s['tp'] > yhi + 0.6 * span
    if not tp_off: yhi = max(yhi, s['tp'] + 0.05 * span)
    a1.axhspan(s['zone'][0], s['zone'][1], xmin=0, xmax=1, alpha=0.0)
    a1.add_patch(Rectangle((s['zoneStart'] - 0.5, s['zone'][0]), n - s['zoneStart'] + 6, s['zone'][1] - s['zone'][0], facecolor='#4575b4', edgecolor='#4575b4', lw=1.2, alpha=0.35, zorder=1, label='Zone FVG d\'entrée'))
    if s['target'] and s['target'][0] < yhi and s['targetStart'] is not None:
        a1.add_patch(Rectangle((s['targetStart'] - 0.5, s['target'][0]), n - s['targetStart'] + 6, s['target'][1] - s['target'][0], facecolor='#f46d43', edgecolor='#f46d43', lw=1.0, alpha=0.3, zorder=1, label='FVG cible'))
    a1.axhline(0, color='#333', lw=1.2, ls='--', zorder=2); a1.text(n + 7, 0, ' Entrée (50 %)', va='center', fontsize=9)
    a1.axhline(s['stop'], color='#d73027', lw=1.2, ls='--', zorder=2); a1.text(n + 7, s['stop'], f" Stop {s['stop']:+.1f}", va='center', fontsize=9, color='#d73027')
    rr = s['tp'] / abs(s['stop']) if s['stop'] else 0
    if not tp_off:
        a1.axhline(s['tp'], color='#1a9850', lw=1.2, ls='--', zorder=2); a1.text(n + 7, s['tp'], f" TP {s['tp']:+.1f} (RR {rr:.1f})", va='center', fontsize=9, color='#1a9850')
    else:
        a1.annotate(f"TP {s['tp']:+.1f} pts (RR {rr:.1f}) au-dessus du graphique", xy=(n * 0.6, yhi), xytext=(n * 0.6, yhi - 0.12 * span), arrowprops=dict(arrowstyle='->', color='#1a9850'), color='#1a9850', fontsize=10, ha='center')
    a1.set_ylim(ylo, yhi); a1.set_xlim(-1, n + 36)
    ticks = [i for i in range(n) if cs[i]['hh'] in ('00:00', '06:00', '12:00', '18:00') or cs[i]['newDay']]
    a1.set_xticks([i for i in range(0, n, 8)]); a1.set_xticklabels([cs[i]['hh'] for i in range(0, n, 8)], fontsize=8, rotation=90)
    for i, k in enumerate(cs):
        if k['newDay']: a1.axvline(i - 0.5, color='#999', lw=0.6, ls=':')
    a1.grid(alpha=0.15); a1.set_ylabel('points par rapport à l\'entrée')
    a1.set_title(f"Signal {s['id']}  |  M15, ordre posé à {s['placedHour']} (heure de New York)  |  risque {s['riskPts']} pts  |  lignes pointillées gris = changement de jour", fontsize=11)
    a1.legend(loc='upper left', fontsize=8)
    h4 = s['h4']; candles(a2, h4)
    a2.axhline(s['h4Low6'], color='#984ea3', lw=1, ls='-.'); a2.text(len(h4) + 0.3, s['h4Low6'], ' bas des 6 dernières H4', va='top', fontsize=8, color='#984ea3')
    a2.axhline(0, color='#333', lw=1, ls='--'); a2.text(len(h4) + 0.3, 0, ' entrée', va='center', fontsize=8)
    a2.set_xlim(-1, len(h4) + 9); a2.set_title('H4 : 40 dernières bougies complètes (même repère de prix)', fontsize=10); a2.grid(alpha=0.15)
    a2.set_xticks(range(0, len(h4), 3)); a2.set_xticklabels([h4[i]['hh'] for i in range(0, len(h4), 3)], fontsize=8)
    plt.tight_layout(); fig.savefig(f"{outdir}/signal_{s['id']:02d}.png", dpi=110); plt.close(fig)
print('ok', len(sigs))
