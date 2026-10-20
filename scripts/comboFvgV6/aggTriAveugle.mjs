import fs from 'node:fs';
// Usage : node aggTriAveugle.mjs "<modèle de chemin avec {n}>"   ex. data/etude-jugement/lot{n}/lot{n}-cle.json   (lots 1 à 8 ; le lot 9 n'a pas été jugé)
const tpl = process.argv[2] || 'data/etude-jugement/lot{n}/lot{n}-cle.json';
// Décisions de Krystofia, telles qu'enregistrées dans docs/REPONSES-TRI-AVEUGLE-LOT*.md avant chaque révélation.
const take = [[3,5,7,8,10],[3,5,6,7,9],[3,7],[],[1,2,4],[1,5,7,8],[1,2,4,7,10],[3,4,6,10]];
const unk = [[],[],[],[],[],[],[9],[]];
const early = [[],[5,9],[3],[],[2],[5],[2,4],[]]; // même sens, autre heure que la pose de F2
const rows = [];
take.forEach((_, i) => { const k = JSON.parse(fs.readFileSync(tpl.replaceAll('{n}', String(i + 1)), 'utf8')); for (const x of k) { const dec = unk[i].includes(x.id) ? 'unk' : take[i].includes(x.id) ? 'take' : 'skip'; rows.push({ lot: i + 1, id: x.id, r: x.r, why: x.why, dec, early: early[i].includes(x.id) }); } });
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function summary(label, sel) {
  const T = sel.filter((x) => x.dec === 'take'), S = sel.filter((x) => x.dec === 'skip'), A = sel.filter((x) => x.dec !== 'unk');
  const st = (a) => ({ n: a.length, tp: a.filter((x) => x.why === 'tp').length, time: a.filter((x) => x.why === 'temps').length, stop: a.filter((x) => x.why === 'stop').length, R: a.reduce((s, x) => s + x.r, 0), mean: mean(a.map((x) => x.r)), win: a.filter((x) => x.r > 0).length });
  const t = st(T), s = st(S), all = st(A);
  const welch = (mean(T.map((x) => x.r)) - mean(S.map((x) => x.r))) / Math.sqrt(sd(T.map((x) => x.r)) ** 2 / T.length + sd(S.map((x) => x.r)) ** 2 / S.length);
  // bootstrap sur la différence de moyennes (pris - sautés)
  const r = rng(20261006), B = 20000, diffs = [];
  for (let b = 0; b < B; b++) { let a = 0, c = 0; for (let i = 0; i < T.length; i++) a += T[Math.floor(r() * T.length)].r; for (let i = 0; i < S.length; i++) c += S[Math.floor(r() * S.length)].r; diffs.push(a / T.length - c / S.length); }
  diffs.sort((x, y) => x - y);
  // permutation : mélange des étiquettes pris/sautés (mêmes effectifs)
  const rs = A.map((x) => x.r), obs = mean(T.map((x) => x.r)); let le = 0; const P = 20000, r2 = rng(777);
  for (let p = 0; p < P; p++) { const idx = rs.slice(); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } if (mean(idx.slice(0, T.length)) <= obs) le++; }
  // part de stops : pris vs sautés (Fisher unilatéral approx par permutation)
  const stops = A.map((x) => (x.why === 'stop' ? 1 : 0)); let leS = 0; const r3 = rng(999); const obsS = T.filter((x) => x.why === 'stop').length / T.length;
  for (let p = 0; p < P; p++) { const idx = stops.slice(); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r3() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } if (idx.slice(0, T.length).reduce((q, v) => q + v, 0) / T.length >= obsS) leS++; }
  console.log(`\n## ${label}`);
  console.log('pris  ', JSON.stringify(t)); console.log('sautés', JSON.stringify(s)); console.log('tous (hors sans avis)', JSON.stringify(all));
  console.log(`part de stops : pris ${(100 * t.stop / t.n).toFixed(0)} % | sautés ${(100 * s.stop / s.n).toFixed(0)} % | tous ${(100 * all.stop / all.n).toFixed(0)} %`);
  console.log(`part de gagnants (R>0) : pris ${(100 * t.win / t.n).toFixed(0)} % | sautés ${(100 * s.win / s.n).toFixed(0)} %`);
  console.log(`diff moyenne (pris - sautés) ${(t.mean - s.mean).toFixed(3)} R | Welch ${welch.toFixed(2)} | IC95 bootstrap [${diffs[Math.floor(0.025 * B)].toFixed(2)} ; ${diffs[Math.floor(0.975 * B)].toFixed(2)}]`);
  console.log(`permutation : P(moyenne des pris <= observée) = ${(le / P).toFixed(3)} ; P(part de stops des pris >= observée) = ${(leS / P).toFixed(3)}`);
  // stops évités / gagnants perdus
  const allStops = A.filter((x) => x.why === 'stop').length, allW = A.filter((x) => x.r > 0).length;
  console.log(`stops évités ${s.stop}/${allStops} | gagnants (R>0) sautés ${s.win}/${allW} | TP sautés ${s.tp}/${all.tp}`);
}
summary('Principal (classement enregistré avant chaque révélation)', rows);
summary('Strict : on retire les signaux où elle serait entrée à une autre heure', rows.filter((x) => !x.early));
summary('Early classés « saute »', rows.map((x) => (x.early ? { ...x, dec: 'skip' } : x)));
// par lot
for (let l = 1; l <= 8; l++) { const T = rows.filter((x) => x.lot === l && x.dec === 'take'), S = rows.filter((x) => x.lot === l && x.dec === 'skip'); console.log(`lot ${l}: pris ${T.length} R ${T.reduce((s, x) => s + x.r, 0).toFixed(2)} (stops ${T.filter((x) => x.why === 'stop').length}) | sautés ${S.length} R ${S.reduce((s, x) => s + x.r, 0).toFixed(2)} (stops ${S.filter((x) => x.why === 'stop').length})`); }
// sans le trade à +8.59
summary('Principal sans le trade à +8,59 R', rows.filter((x) => x.r < 8));
