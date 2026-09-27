// Lecture intermédiaire pré-enregistrée (amendement du 27/09) : 110 achats du matin, meche_3R, ordres remplis.
// Usage : node scripts/runBlindInterim.cjs <dossier des réponses answers6>
const fs = require('fs');
const O = new Map(JSON.parse(fs.readFileSync('/home/user/ict-fvg-bot/data/backtest-input/blind-outcomes.json')).outcomes.map((o) => [o.id, o]));
const dir = process.argv[2]; // dossier des réponses exportées (collection answers6), gardé hors du dépôt
const rows = fs.readdirSync(dir).filter((f) => f[0] === 'a').map((f) => ({ id: f.slice(0, 4), ...JSON.parse(fs.readFileSync(dir + f)) }));
const filled = rows.map((a) => ({ ...a, r: O.get(a.id).r.meche_3R.r })).filter((a) => a.r !== undefined);
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const Y = filled.filter((a) => a.take).map((a) => a.r), N = filled.filter((a) => !a.take).map((a) => a.r);
const gap = mean(Y) - mean(N);
let seed = 7, ge = 0; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const all = [...Y, ...N];
for (let k = 0; k < 10000; k++) { const a = [...all]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } if (mean(a.slice(0, Y.length)) - mean(a.slice(Y.length)) >= gap) ge++; }
console.log(`réponses ${rows.length} (oui ${rows.filter((a) => a.take).length}, non ${rows.filter((a) => !a.take).length}) ; remplis oui ${Y.length}, non ${N.length}`);
console.log(`R moyen oui ${mean(Y).toFixed(3)} ; R moyen non ${mean(N).toFixed(3)} ; écart ${gap.toFixed(3)} ; p unilatéral ${(ge / 10000).toFixed(4)}`);
console.log(`gagnants oui ${Y.filter((x) => x > 0).length}/${Y.length} ; non ${N.filter((x) => x > 0).length}/${N.length}`);
const futile = Y.length >= 25 && N.length >= 25 && (gap <= 0 || mean(Y) <= 0);
console.log(Y.length < 25 || N.length < 25 ? 'DÉCISION : pas assez de remplis, continuer' : futile ? 'DÉCISION : ARRÊT POUR FUTILITÉ' : 'DÉCISION : CONTINUER');
