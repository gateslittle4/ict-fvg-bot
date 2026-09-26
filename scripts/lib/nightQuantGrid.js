// nightQuantGrid.js - grille de la piste D1 « limite au creux » (recherche de nuit), partagée par l'exploration, la validation et le final.
export const D1_WINDOWS = {
  '3h-11h, sortie 11h': { fromMin: 180, toMin: 660, exitMin: 660 },
  '3h-9h30, sortie 9h30': { fromMin: 180, toMin: 570, exitMin: 570 },
  '9h30-15h30, sortie 16h': { fromMin: 570, toMin: 930, exitMin: 960 },
  'nuit 18h-3h, sortie 3h': { fromMin: 1080, toMin: 180, exitMin: 180 },
};
export const D1_DS = [0.25, 0.5, 0.75, 1];
export const D1_RRS = [1, 2, 3];
export const D1_DIRS = { achat: [1], vente: [-1], 'les deux': [1, -1] };
export const D1_EXECS = ['limit', 'market'];
