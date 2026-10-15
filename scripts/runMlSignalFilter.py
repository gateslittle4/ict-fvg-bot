#!/usr/bin/env python3
# runMlSignalFilter.py - étape 2 du filtre ML. Règles exactes : data/backtest-input/preregistration-ml-signal-filter-2026-10-15.md
# Usage : python3 -I scripts/runMlSignalFilter.py   (lit data/ml-signal-filter/signals.csv, écrit data/backtest-input/ml-signal-filter-study.md)
import numpy as np, pandas as pd, datetime as dt
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import TimeSeriesSplit

OFF = 5 * 3600 * 1000
ms = lambda y: dt.datetime(y, 1, 1, tzinfo=dt.timezone.utc).timestamp() * 1000 - OFF
df = pd.read_csv('data/ml-signal-filter/signals.csv').sort_values('time').reset_index(drop=True)
NUM = ['dir', 'hour', 'dow', 'stop_pct', 'stop_atr', 'vol_ratio', 'ema_dev', 'ret5d', 'last_range', 'rr']
X = pd.concat([df[NUM], pd.get_dummies(df['source'], prefix='src').astype(float), pd.get_dummies(df['symbol'], prefix='sym').astype(float)], axis=1)
y = (df['net_r'] > 0).astype(int).values
r = df['net_r'].values
tr = df['time'] < ms(2025); te = (df['time'] >= ms(2025)) & (df['time'] < ms(2026)); fw = df['time'] >= ms(2026)
print('n train/test/fwd', tr.sum(), te.sum(), fw.sum())

def make(kind):
    if kind == 'logit': return LogisticRegression(C=1.0, penalty='l2', max_iter=2000)
    return RandomForestClassifier(n_estimators=300, max_depth=3, min_samples_leaf=30, random_state=0, n_jobs=-1)

def fit_score(kind, Xtr, ytr, Xs):
    sc = StandardScaler().fit(Xtr); m = make(kind).fit(sc.transform(Xtr), ytr)
    return [m.predict_proba(sc.transform(x))[:, 1] for x in Xs]

Xtr, Xte, Xfw = X[tr].values, X[te].values, X[fw].values
ytr, yte, yfw = y[tr], y[te], y[fw]
rtr, rte, rfw = r[tr], r[te], r[fw]
lines = ['# Filtre ML des signaux du combo (pré-enregistré 2026-10-15)', '',
 'Règles : `preregistration-ml-signal-filter-2026-10-15.md`. Signaux du vrai moteur, M1 exact, `data/real-m1-full`. Entraînement < 2025, TEST 2025 (lu une fois), forward 2026. Filtre = 50 % de signaux au meilleur score (seuil = médiane des scores d\'entraînement).', '',
 f'Signaux : entraînement {tr.sum()}, test {te.sum()}, forward {fw.sum()}. R/trade tous signaux : entraînement {rtr.mean():+.3f}, test {rte.mean():+.3f}, forward {rfw.mean():+.3f}. % gagnants : {ytr.mean():.1%} / {yte.mean():.1%} / {yfw.mean():.1%}.', '']
verdict_rows = []
rng = np.random.default_rng(0)
for kind, nm in [('logit', 'Régression logistique L2'), ('rf', 'Forêt aléatoire (300 arbres, profondeur 3)')]:
    s_tr, s_te, s_fw = fit_score(kind, Xtr, ytr, [Xtr, Xte, Xfw])
    thr = np.median(s_tr)
    auc_te, auc_fw = roc_auc_score(yte, s_te), roc_auc_score(yfw, s_fw)
    k_te, k_fw = s_te >= thr, s_fw >= thr
    cv = []
    for a, b in TimeSeriesSplit(n_splits=3).split(Xtr):
        if len(set(ytr[b])) < 2: continue
        sb, = fit_score(kind, Xtr[a], ytr[a], [Xtr[b]]); cv.append(roc_auc_score(ytr[b], sb))
    cv_auc = float(np.mean(cv))
    nperm = 1000 if kind == 'logit' else 300  # RF : 300 permutations (coût) - écart déclaré au pré-enregistrement (1000)
    ge = 0
    for _ in range(nperm):
        yp = rng.permutation(ytr)
        sp, = fit_score(kind, Xtr, yp, [Xte]); ge += roc_auc_score(yte, sp) >= auc_te
    p = (ge + 1) / (nperm + 1)
    base_te, kept_te = rte.mean(), rte[k_te].mean()
    base_fw, kept_fw = rfw.mean(), rfw[k_fw].mean()
    ok = auc_te > 0.55 and kept_te >= base_te + 0.05 and kept_te > 0 and p < 0.05 and cv_auc > 0.52
    verdict_rows.append((nm, ok))
    lines += [f'## {nm}', '',
      f'- Validation croisée temporelle (entraînement, 3 plis) : AUC moyenne {cv_auc:.3f} (seuil > 0,52).',
      f'- TEST 2025 : AUC {auc_te:.3f} (seuil > 0,55) ; signaux gardés {k_te.sum()}/{len(k_te)} : R/trade {kept_te:+.3f} contre {base_te:+.3f} tous signaux (écart {kept_te-base_te:+.3f}, seuil +0,05) ; R total gardé {rte[k_te].sum():+.1f} contre {rte.sum():+.1f}.',
      f'- Placebo ({nperm} permutations des étiquettes d\'entraînement) : p = {p:.3f} (seuil < 0,05).',
      f'- Forward 2026 (robustesse) : AUC {auc_fw:.3f} ; gardés {k_fw.sum()}/{len(k_fw)} : R/trade {kept_fw:+.3f} contre {base_fw:+.3f} ; R total {rfw[k_fw].sum():+.1f} contre {rfw.sum():+.1f}.',
      f'- **Verdict : {"CANDIDAT (à confirmer en démo, jamais adopté sur ce seul test)" if ok else "REJETÉ (critères non remplis)"}**', '']
    print(nm, 'cv', round(cv_auc,3), 'AUC test', round(auc_te,3), 'kept', round(kept_te,3), 'vs', round(base_te,3), 'p', round(p,3), 'fwd AUC', round(auc_fw,3), 'kept fwd', round(kept_fw,3), 'vs', round(base_fw,3), '->', ok)
lines += ['## Limites', '', '- Entraînement court (~2 ans, M1 broker) : le M1 HistData 2010-2022 n\'est pas dans le dépôt (écart déclaré dans le pré-enregistrement).', '- Placebo de la forêt : 300 permutations au lieu de 1 000 (temps de calcul), déclaré.', '- Les trades sont réglés comme des signaux indépendants (garde-fous non rejoués), niveau absolu surestimé ; seuls les écarts entre « gardés » et « tous » comptent.', '- Un modèle qui passerait resterait un candidat : échantillon de 2025 petit, signaux autocorrélés.']
open('data/backtest-input/ml-signal-filter-study.md', 'w').write('\n'.join(lines) + '\n')
