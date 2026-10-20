"""comboAP_ml_tous_fvg.py - apprentissage, sélection et jugement du modèle appris sur tous les FVG M15.
Règles et critères FIGÉS : docs/PREREG-ML-TOUS-FVG.md. Aucun réglage après lecture.
Étapes (dans l'ordre) :
  fit          <dossier ml>                       apprend sur 2011-2019, choisit (configuration, q) sur 2020-2022, écrit sel_test.csv
  jug-test     <dossier ml> <exec_test.csv>       juge 2023-2025 (US100) ; écrit VERDICT-TEST.json
  scelle-score <dossier ml>                       exige VERDICT-TEST.json ; pose le verrou ; écrit sel_scelle.csv (aucune statistique affichée)
  jug-scelle   <dossier ml> <exec_scelle.csv>     juge le scellé, une seule fois
"""
import sys, os, json, hashlib, datetime
import numpy as np, pandas as pd, joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.inspection import permutation_importance

PREREG_SHA256 = 'd3ed96e73763fd5a311ece670c5d903bf0b4f689782cf4be9278b17575e8ba44'
FEATS = ['dir', 'lnRisqueATR', 'lnRRprevu', 'age', 'hauteurFVGsurRisque', 'distObjectifATR', 'hauteurCibleATR', 'h09_12', 'h12_16', 'lundi', 'vendredi', 'balayage32', 'depuisBalayage', 'pos96', 'pos480', 'ret96ATR', 'ret480ATR', 'atrRel']
TRAIN_END, VAL = 2019, (2020, 2022)
TEST = (2023, 2025)
DEPTHS, ITERS, QS, MINSEL, CLIP = [2, 3, 4], [100, 300], [5, 10, 20, 30, 50], 300, 8.0
N_PERM, SEED = 10000, 12345
KEY = ['inst', 'Y', 'm', 'zc', 'dir']

def check_prereg():
    here = os.path.dirname(os.path.abspath(__file__)); pre = os.path.join(here, '..', '..', 'docs', 'PREREG-ML-TOUS-FVG.md')
    if not os.path.exists(pre): sys.exit('Pré-enregistrement introuvable : aucun calcul.')
    h = hashlib.sha256(open(pre, encoding='utf8').read().replace('\r\n', '\n').encode()).hexdigest()
    if h != PREREG_SHA256: sys.exit(f'Pré-enregistrement modifié ({h}) : aucun calcul.')
    return h

def stat(r):
    r = np.asarray(r, float); n = len(r)
    if n == 0: return dict(n=0, win=float('nan'), tot=0.0, avg=float('nan'), t=float('nan'))
    avg = r.mean(); sd = r.std(ddof=1) if n > 1 else 0.0
    return dict(n=int(n), win=float((r > 0).mean()), tot=float(r.sum()), avg=float(avg), t=float(avg / (sd / np.sqrt(n))) if sd > 0 else float('nan'))

def fmt(s): return f"n={s['n']:5d} gagn={s['win']*100:3.0f}% R={s['tot']:8.1f} moy={s['avg']:6.3f} t={s['t']:5.2f}"

def perm_test(df):
    """df : setups avec colonnes inst, Y, filled, r, sel. Tirages de sous-ensembles aléatoires de même taille, groupe (instrument, année) par groupe."""
    rng = np.random.default_rng(SEED); sums = np.zeros(N_PERM); ntot = 0; obs_sum = 0.0
    for _, g in df[df.filled == 1].groupby(['inst', 'Y']):
        k = int(g.sel.sum())
        if k == 0: continue
        r = g.r.values.astype(float); obs_sum += r[g.sel.values == 1].sum()
        idx = rng.random((N_PERM, len(r))).argsort(axis=1)[:, :k]; sums += r[idx].sum(axis=1); ntot += k
    if ntot == 0: return dict(obs=float('nan'), nullmean=float('nan'), p=float('nan'), n=0)
    null = sums / ntot; obs = obs_sum / ntot
    return dict(obs=float(obs), nullmean=float(null.mean()), p=float((null >= obs - 1e-12).mean()), n=int(ntot))

def make_model(depth, iters):
    return HistGradientBoostingRegressor(max_depth=depth, max_iter=iters, learning_rate=0.05, min_samples_leaf=200, l2_regularization=1.0, random_state=0)

def write_sel(df, path):
    df[KEY + ['sel']].to_csv(path, index=False)

def cmd_fit(W):
    dev = pd.read_csv(f'{W}/setups_dev.csv'); lab = dev[dev.filled == 1]
    tr = lab[lab.Y <= TRAIN_END]; val = dev[(dev.Y >= VAL[0]) & (dev.Y <= VAL[1])]; te = dev[(dev.Y >= TEST[0]) & (dev.Y <= TEST[1])].copy()
    print(f'apprentissage : {len(tr)} setups étiquetés (2011-{TRAIN_END}) | validation : {len(val)} candidats ({int((val.filled==1).sum())} étiquetés) | test : {len(te)} candidats')
    best = None; table = []
    for d in DEPTHS:
        for it in ITERS:
            m = make_model(d, it).fit(tr[FEATS], tr.r.clip(upper=CLIP)); vs = m.predict(val[FEATS])
            for q in QS:
                tau = float(np.quantile(vs, 1 - q / 100)); s = val[(vs >= tau) & (val.filled == 1)]
                if len(s) < MINSEL: table.append((d, it, q, len(s), float('nan'))); continue
                avg = float(s.r.mean()); table.append((d, it, q, len(s), avg))
                if best is None or avg > best['avg']: best = dict(depth=d, iters=it, q=q, tau=tau, avg=avg, nsel=len(s), model=m)
    print('Grille (profondeur, itérations, q%, étiquetés retenus, R moyen validation) :')
    for row in table: print('  ', row[:4], 'moy=' + ('%.3f' % row[4] if row[4] == row[4] else 'n/a (moins de 300)'))
    if best is None: sys.exit('Aucune configuration ne retient 300 setups étiquetés sur la validation : arrêt.')
    print(f"CHOIX : profondeur {best['depth']}, {best['iters']} itérations, q={best['q']} %, tau={best['tau']:.4f}, R moyen validation {best['avg']:.3f} sur {best['nsel']} setups")
    joblib.dump(best['model'], f'{W}/modele.joblib')
    json.dump({k: best[k] for k in ('depth', 'iters', 'q', 'tau', 'avg', 'nsel')}, open(f'{W}/choix.json', 'w'), indent=1)
    te['sel'] = (best['model'].predict(te[FEATS]) >= best['tau']).astype(int); write_sel(te, f'{W}/sel_test.csv')
    print(f"test : {len(te)} candidats, {int(te.sel.sum())} retenus ({te.sel.mean()*100:.1f} %) -> sel_test.csv")

def cmd_jug_test(W, EX):
    ctl = json.load(open(f'{W}/controles.json')); ex = pd.read_csv(EX); meta = json.load(open(EX + '.meta.json'))
    ml, f2 = ex[ex.kind == 'ml'], ex[ex.kind == 'f2']; sm, sf = stat(ml.r), stat(f2.r)
    dev = pd.read_csv(f'{W}/setups_dev.csv'); sel = pd.read_csv(f'{W}/sel_test.csv'); te = dev.merge(sel, on=KEY, how='inner')
    pt = perm_test(te); unsc = meta['unscored'] / max(1, meta['decisions'])
    print('## MOTEUR FILTRÉ (une position à la fois), US100 2023-2025'); print('modèle ', fmt(sm)); print('F2     ', fmt(sf))
    print(f"candidats sans score : {meta['unscored']} sur {meta['decisions']} décisions ({unsc*100:.2f} %)")
    print(f"Permutation ({N_PERM} tirages) : R moyen des retenus (étiquettes indépendantes, {pt['n']} setups) {pt['obs']:.3f}, tirages {pt['nullmean']:.3f}, p = {pt['p']:.4f}")
    c1 = sm['n'] >= 100; c2 = c1 and sm['avg'] > 0 and sm['t'] >= 1.96; c3 = c1 and sm['avg'] > sf['avg']; c4 = pt['p'] <= 0.05; ctls = bool(ctl['f2']['ok'] and ctl['labelMatch']['ok'])
    print(f'crit.1 (>=100 trades) {c1} | crit.2 (moy>0, t>=1,96) {c2} | crit.3 (> F2) {c3} | crit.4 (p<=0,05) {c4} | contrôles {ctls}')
    if not c1: v = 'NON CONCLUANT'
    elif c2 and c3 and c4 and ctls: v = 'MODÈLE UTILE'
    elif sm['avg'] > 0 and sm['t'] >= 1.0 and pt['p'] <= 0.10: v = 'COMPATIBLE, NON PROUVÉ'
    else: v = 'AUCUN GAIN'
    if unsc > 0.05: v += ' (à interpréter avec prudence : plus de 5 % de candidats sans score)'
    print('\nVERDICT TEST :', v)
    # ----- descriptif (non jugé) -----
    print('\n## DESCRIPTIF (non jugé), étiquettes indépendantes sur les candidats du test')
    L = te[te.filled == 1]
    for nm, d in (('tous', L), ('retenus', L[L.sel == 1]), ('écartés', L[L.sel == 0])): print(f'{nm:8s}', fmt(stat(d.r)))
    for Y in range(TEST[0], TEST[1] + 1):
        d = L[L.Y == Y]; print(f'  {Y}: tous {fmt(stat(d.r))} | retenus {fmt(stat(d[d.sel == 1].r))}')
    for nm, dd in (('achats', 1), ('ventes', -1)):
        d = L[L.dir == dd]; print(f'  {nm}: tous {fmt(stat(d.r))} | retenus {fmt(stat(d[d.sel == 1].r))}')
    model = joblib.load(f'{W}/modele.joblib'); val = dev[(dev.Y >= VAL[0]) & (dev.Y <= VAL[1]) & (dev.filled == 1)]
    pi = permutation_importance(model, val[FEATS], val.r.clip(upper=CLIP), n_repeats=5, random_state=0, scoring='neg_mean_squared_error')
    print('Importance par permutation (validation) :', ', '.join(f'{f}={v:.4f}' for f, v in sorted(zip(FEATS, pi.importances_mean), key=lambda x: -x[1])[:8]))
    tr = dev[(dev.filled == 1) & (dev.Y <= TRAIN_END)]; sc = StandardScaler().fit(tr[FEATS]); rg = Ridge(alpha=100).fit(sc.transform(tr[FEATS]), tr.r.clip(upper=CLIP))
    ch = json.load(open(f'{W}/choix.json')); vall = dev[(dev.Y >= VAL[0]) & (dev.Y <= VAL[1])]; tau = np.quantile(rg.predict(sc.transform(vall[FEATS])), 1 - ch['q'] / 100)
    rs = rg.predict(sc.transform(L[FEATS])) >= tau; print('Ridge (comparaison, même q) : retenus', fmt(stat(L[rs].r)), '| écartés', fmt(stat(L[~rs].r)))
    json.dump(dict(verdict=v, modele=sm, f2=sf, permutation=pt, criteres=dict(c1=bool(c1), c2=bool(c2), c3=bool(c3), c4=bool(c4), controles=ctls), sansScorePct=unsc * 100, jug=datetime.datetime.utcnow().isoformat()), open(f'{W}/VERDICT-TEST.json', 'w'), indent=1)

def cmd_scelle_score(W):
    if not os.path.exists(f'{W}/VERDICT-TEST.json'): sys.exit('Le verdict du test doit exister avant de toucher au scellé.')
    lock = f'{W}/SCELLE.lock'
    if os.path.exists(lock): sys.exit('Le scellé a déjà été ouvert : une seule lecture.')
    open(lock, 'w').write(datetime.datetime.utcnow().isoformat())
    sd = pd.read_csv(f'{W}/setups_scelle.csv'); model = joblib.load(f'{W}/modele.joblib'); ch = json.load(open(f'{W}/choix.json'))
    sd['sel'] = (model.predict(sd[FEATS]) >= ch['tau']).astype(int); write_sel(sd, f'{W}/sel_scelle.csv')
    print(f"scellé ouvert : {len(sd)} candidats scorés, sélection écrite dans sel_scelle.csv (aucune statistique de résultat n'est affichée ici).")

def cmd_jug_scelle(W, EX):
    ex = pd.read_csv(EX); meta = json.load(open(EX + '.meta.json')); sd = pd.read_csv(f'{W}/setups_scelle.csv').merge(pd.read_csv(f'{W}/sel_scelle.csv'), on=KEY, how='inner')
    print('## SCELLÉ (une seule lecture) : moteur filtré, une position à la fois')
    print(f"candidats sans score : {meta['unscored']} sur {meta['decisions']} décisions")
    groups = [('US100 2026', 'US100'), ('GER40 2023-2026', 'GER40'), ('XAUUSD 2023-2026', 'XAUUSD')]
    for nm, inst in groups:
        a, b = ex[(ex.kind == 'ml') & (ex.inst == inst)], ex[(ex.kind == 'f2') & (ex.inst == inst)]
        pt = perm_test(sd[sd.inst == inst]); print(f'{nm:18s} modèle', fmt(stat(a.r)), f"| F2 {fmt(stat(b.r))} | permutation p={pt['p']:.3f}")
    ml, f2 = ex[ex.kind == 'ml'], ex[ex.kind == 'f2']; sm, sf, pt = stat(ml.r), stat(f2.r), perm_test(sd)
    print('REGROUPÉ           modèle', fmt(sm), '| F2', fmt(sf)); print(f"Permutation regroupée : retenus {pt['obs']:.3f}, tirages {pt['nullmean']:.3f}, p = {pt['p']:.4f}")
    ok = sm['avg'] > 0 and sm['t'] >= 1.96 and pt['p'] <= 0.05
    v = 'CONFIRMÉ' if ok else 'NON CONFIRMÉ'; print('\nVERDICT SCELLÉ :', v)
    json.dump(dict(verdict=v, modele=sm, f2=sf, permutation=pt, jug=datetime.datetime.utcnow().isoformat()), open(f'{W}/VERDICT-SCELLE.json', 'w'), indent=1)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''; W = sys.argv[2] if len(sys.argv) > 2 else ''
    if cmd not in ('fit', 'jug-test', 'scelle-score', 'jug-scelle') or not W: sys.exit(__doc__)
    print('ML tous FVG | pré-enregistrement SHA-256', check_prereg(), '|', datetime.datetime.utcnow().isoformat())
    if cmd == 'fit': cmd_fit(W)
    elif cmd == 'jug-test': cmd_jug_test(W, sys.argv[3])
    elif cmd == 'scelle-score': cmd_scelle_score(W)
    else: cmd_jug_scelle(W, sys.argv[3])
