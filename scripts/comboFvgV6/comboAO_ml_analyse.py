"""comboAO_ml_analyse.py - analyse en avancée (walk-forward) du filtre statistique sur les trades F2C.
Règles et critères FIGÉS : docs/PREREG-F2-ML-FILTRE.md. Aucun réglage après lecture.
Usage : python3 -I comboAO_ml_analyse.py <DONNEES-F2-ML.csv> [sortie.txt]
"""
import sys, hashlib, datetime, os
import numpy as np, pandas as pd
from sklearn.linear_model import Ridge, LogisticRegression
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.preprocessing import StandardScaler

PREREG_SHA256 = 'b2870bd2ac59079d4d7d8b9625e624d148db10053ddc72ddbf4ba6ec1e15502f'
FEATS = ['x1_lnRisqueATR', 'x2_lnRRprevu', 'x3_age', 'x4_hauteurFVGsurRisque', 'x5_h09_12', 'x6_h12_16', 'x7_lundi']
ALPHA, TEST_YEARS, N_PERM, SEED = 100.0, list(range(2017, 2027)), 10000, 12345

def jan1_ms(y): return datetime.datetime(y, 1, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000

def stat(r):
    r = np.asarray(r, float); n = len(r)
    if n == 0: return dict(n=0, win=np.nan, tot=0.0, avg=np.nan, t=np.nan)
    avg = r.mean(); sd = r.std(ddof=1) if n > 1 else 0.0
    return dict(n=n, win=(r > 0).mean(), tot=r.sum(), avg=avg, t=(avg / (sd / np.sqrt(n)) if sd > 0 else np.nan))

def fmt(s): return f"n={s['n']:4d} gagn={s['win']*100:3.0f}% R={s['tot']:7.1f} moy={s['avg']:6.3f} t={s['t']:5.2f}"

def walk(df, model):
    """Retourne un tableau booléen 'pris' (None si pas de test pour la ligne) ; entraînement sur les trades sortis avant le 1er janvier de Y."""
    take = pd.Series(np.nan, index=df.index)
    for Y in TEST_YEARS:
        tr = df[df.exitRaw < jan1_ms(Y)]; te = df[df.Y == Y]
        if len(te) == 0 or len(tr) < 100: continue
        sc = StandardScaler().fit(tr[FEATS]); Xtr, Xte = sc.transform(tr[FEATS]), sc.transform(te[FEATS])
        if model == 'ridge':
            m = Ridge(alpha=ALPHA).fit(Xtr, tr.r); thr = tr.r.mean(); p = m.predict(Xte)
        elif model == 'logit':
            m = LogisticRegression(C=1.0, max_iter=1000).fit(Xtr, (tr.r > 0).astype(int)); thr = (tr.r > 0).mean(); p = m.predict_proba(Xte)[:, 1]
        else:
            m = HistGradientBoostingRegressor(max_depth=2, max_iter=100, learning_rate=0.05, random_state=0).fit(Xtr, tr.r); thr = tr.r.mean(); p = m.predict(Xte)
        take.loc[te.index] = (p > thr).astype(float)
    return take

def main():
    src, out = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'SORTIE-F2-ML.txt'); lines = []
    def log(*a):
        s = ' '.join(str(x) for x in a); lines.append(s); print(s)
    here = os.path.dirname(os.path.abspath(__file__)); pre = os.path.join(here, '..', '..', 'docs', 'PREREG-F2-ML-FILTRE.md')
    if not os.path.exists(pre): sys.exit('Pré-enregistrement introuvable : aucun calcul.')
    h = hashlib.sha256(open(pre, encoding='utf8').read().replace('\r\n', '\n').encode()).hexdigest()
    if h != PREREG_SHA256: sys.exit(f'Pré-enregistrement modifié ({h}) : aucun calcul.')
    log('F2 ML | pré-enregistrement SHA-256', h, '| lancé', datetime.datetime.utcnow().isoformat())
    df = pd.read_csv(src).sort_values('fillRaw').reset_index(drop=True)
    ctl_rows = df[df.Y <= 2022]
    control = len(ctl_rows) == 1222 and abs(ctl_rows.r.sum() - 129.7) < 0.06
    log(f'CONTRÔLE 2011-2022 : n={len(ctl_rows)} R={ctl_rows.r.sum():.1f}', '=> OK' if control else '=> ÉCHEC')
    if not control: log('Le contrôle échoue : rien d\'autre n\'est lu.'); open(out, 'w').write('\n'.join(lines) + '\n'); sys.exit(1)

    # ---------- modèle principal : ridge ----------
    df['sel'] = walk(df, 'ridge'); te = df[df.sel.notna()].copy(); te['sel'] = te.sel.astype(bool)
    pris, saut = te[te.sel], te[~te.sel]
    log('\n## MODÈLE PRINCIPAL : ridge (alpha=100), walk-forward 2017-2026')
    for nm, d in (('tous', te), ('pris', pris), ('sautés', saut)): log(f'{nm:7s}', fmt(stat(d.r)))
    halves = {'2017-2021': (2017, 2021), '2022-2026': (2022, 2026)}; c2 = True
    for nm, (a, b) in halves.items():
        s = {k: stat(d[(d.Y >= a) & (d.Y <= b)].r) for k, d in (('tous', te), ('pris', pris), ('sautés', saut))}
        ok = s['pris']['avg'] > s['sautés']['avg'] and s['pris']['avg'] > s['tous']['avg']; c2 = c2 and bool(ok)
        log(f'  {nm}:', ' | '.join(f'{k} {fmt(v)}' for k, v in s.items()), '=>', 'pris > sautés et > tous' if ok else 'critère 2 NON rempli')
    # permutation : sous-ensembles aléatoires de même taille, année par année
    rng = np.random.default_rng(SEED); obs = pris.r.mean(); sums = np.zeros(N_PERM); ntot = 0
    for Y in TEST_YEARS:
        ry = te[te.Y == Y].r.values; k = int(((te.Y == Y) & te.sel).sum())
        if k == 0 or len(ry) == 0: continue
        idx = rng.random((N_PERM, len(ry))).argsort(axis=1)[:, :k]; sums += ry[idx].sum(axis=1); ntot += k
    perm = sums / ntot; p_perm = float((perm >= obs - 1e-12).mean())
    log(f'\nPermutation ({N_PERM} tirages, graine {SEED}) : R moyen observé des pris {obs:.3f}, moyenne des tirages {perm.mean():.3f}, p = {p_perm:.4f}')
    sp = stat(pris.r)
    c1 = sp['avg'] > 0 and sp['t'] >= 1.96; c3 = p_perm <= 0.05; c4 = control
    log(f'Critère 1 (pris moy>0 et t>=1,96) : {c1} | critère 2 (deux périodes) : {c2} | critère 3 (p<=0,05) : {c3} | critère 4 (contrôle) : {c4}')
    if c1 and c2 and c3 and c4: v = 'FILTRE UTILE'
    elif sp['avg'] > stat(te.r)['avg'] and p_perm <= 0.10: v = 'COMPATIBLE, NON PROUVÉ'
    else: v = 'AUCUN GAIN'
    log('\nVERDICT :', v)

    # ---------- descriptif (non jugé) ----------
    log('\n## DESCRIPTIF (non jugé)')
    log('Par année (tous | pris | sautés) :')
    for Y in TEST_YEARS:
        d = te[te.Y == Y]
        if len(d): log(f'  {Y}: tous {fmt(stat(d.r))} | pris {fmt(stat(d[d.sel].r))} | sautés {fmt(stat(d[~d.sel].r))}')
    wins = sum(1 for Y in TEST_YEARS if len(te[(te.Y == Y) & te.sel]) and len(te[(te.Y == Y) & ~te.sel]) and te[(te.Y == Y) & te.sel].r.mean() > te[(te.Y == Y) & ~te.sel].r.mean())
    log(f'Années où pris > sautés : {wins} sur {len(TEST_YEARS)}')
    for nm, d in (('2011-2022', df[df.Y <= 2022]), ('2011-2026', df)):
        sc = StandardScaler().fit(d[FEATS]); m = Ridge(alpha=ALPHA).fit(sc.transform(d[FEATS]), d.r)
        log(f'Coefficients ridge standardisés sur {nm} (R par écart-type de variable) :', ', '.join(f'{f}={c:+.3f}' for f, c in zip(FEATS, m.coef_)))
    for nm, lab in (('logit', 'régression logistique'), ('hgb', 'arbres boostés')):
        t2 = df.copy(); t2['sel'] = walk(df, nm); tt = t2[t2.sel.notna()]; tk = tt.sel.astype(bool)
        log(f'{nm:5s} ({lab}): tous {fmt(stat(tt.r))} | pris {fmt(stat(tt[tk].r))} | sautés {fmt(stat(tt[~tk].r))}')
    open(out, 'w').write('\n'.join(lines) + '\n')

main()
