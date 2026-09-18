// labDatasets.js
// Disk side of the Labo's "importer mes données" feature: one M15 dataset per
// name under `dir`, extended file by file (a year of M1 at a time). Runs inside
// labWorker.js - parsing tens of MB is CPU work that must never touch the
// live trading bot's event loop (see labClient.js).
//
// STORAGE IS EPHEMERAL ON RENDER'S FREE TIER: the filesystem is wiped on every
// deploy/restart, so imported datasets last until the next one. The UI says so;
// durable storage would need Supabase (a new table in the production project -
// deliberately not created without asking).

import fs from 'node:fs';
import path from 'node:path';
import { createAggregator, parseM1Text, candlesToCsv, parseDatasetCsv, isValidDatasetName, ImportError } from './m1Import.js';
import { chooseTrainTestCutoff } from './labRunner.js';
import { DEFAULT_SPREADS } from './transactionCosts.js';

export const MAX_CUSTOM_DATASETS = 12;
const MAX_FILE_HISTORY = 100;

export const csvPathFor = (dir, name) => path.join(dir, `${name}.csv`);
const metaPathFor = (dir, name) => path.join(dir, `${name}.meta.json`);

export function readDatasetMeta(dir, name) {
  try {
    return JSON.parse(fs.readFileSync(metaPathFor(dir, name), 'utf8'));
  } catch {
    return null;
  }
}

/** Newest first. A missing directory just means nothing has been imported yet. */
export function listDatasets(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.meta.json'))
    .map((n) => readDatasetMeta(dir, n.replace(/\.meta\.json$/, '')))
    .filter((m) => m && fs.existsSync(csvPathFor(dir, m.name)))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

// Write-then-rename so a crash or a timeout mid-write can never leave a
// half-written dataset that the next run would happily load.
function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

/**
 * Adds ONE uploaded file to a dataset (creating it if needed) and rewrites the
 * dataset's M15 CSV + metadata. All-or-nothing: any validation/parse failure
 * throws before anything on disk is touched.
 * @param {object} p
 * @param {string} p.dir
 * @param {string} p.name - dataset name (letters/digits/_/-)
 * @param {string} p.symbol - the pair (drives spread lookup): e.g. EURGBP
 * @param {number|null} [p.spread] - price-unit spread; required when the pair has no known one
 * @param {'est'|'utc'} [p.tz]
 * @param {boolean} [p.replace] - start the dataset over instead of extending it
 * @param {string} p.text - the file's content
 * @param {string} [p.filename]
 */
export function importIntoDataset({ dir, name, symbol, spread = null, tz = 'est', replace = false, text, filename = 'fichier', now = Date.now() }) {
  if (!isValidDatasetName(name)) throw new ImportError('Nom de jeu de données invalide (lettres, chiffres, _ et - seulement, 24 caractères max).');
  const pair = String(symbol || '').toUpperCase();
  if (!isValidDatasetName(pair)) throw new ImportError('Paire invalide (lettres et chiffres, ex. EURGBP).');
  if (spread !== null && (!Number.isFinite(spread) || spread < 0)) throw new ImportError('Spread invalide (nombre positif en unités de prix, ex. 0.00012).');

  fs.mkdirSync(dir, { recursive: true });
  const existing = readDatasetMeta(dir, name);
  const existingCsv = existing && fs.existsSync(csvPathFor(dir, name)) ? csvPathFor(dir, name) : null;

  if (!existing && listDatasets(dir).length >= MAX_CUSTOM_DATASETS) {
    throw new ImportError(`Trop de jeux de données importés (max ${MAX_CUSTOM_DATASETS}) - supprime-en un d'abord.`);
  }
  const extending = Boolean(existingCsv) && !replace;
  if (extending) {
    if (existing.symbol !== pair) {
      throw new ImportError(`Ce jeu contient déjà de l'${existing.symbol} : impossible d'y mélanger du ${pair}. Choisis un autre nom, ou coche "remplacer".`);
    }
    if (existing.tz !== tz) {
      throw new ImportError(`Ce jeu a été importé en fuseau "${existing.tz}" : mélanger avec "${tz}" décalerait les heures de 5 h et fausserait toutes les sessions. Utilise le même fuseau, ou coche "remplacer".`);
    }
  }

  const effectiveSpread = spread ?? (extending && existing.spread !== undefined ? existing.spread : (DEFAULT_SPREADS[pair] ?? null));
  if (effectiveSpread === null) {
    throw new ImportError(`Spread inconnu pour ${pair} : indique-le (unités de prix, ex. 0.00012 pour 1.2 pip sur une paire à 4 décimales). Sans lui les coûts seraient nuls et les résultats trop beaux.`);
  }
  const spreadSource = spread !== null ? 'saisi' : extending && existing.spread !== undefined ? existing.spreadSource : 'table du projet';

  const aggregator = createAggregator();
  if (extending) for (const c of parseDatasetCsv(fs.readFileSync(existingCsv, 'utf8'))) aggregator.addCandle(c);
  const parsed = parseM1Text(text, aggregator, { tz });

  const candles = aggregator.toCandles();
  const { cutoff, kind } = chooseTrainTestCutoff(candles);
  const files = [...(extending ? existing.files || [] : []), {
    filename, format: parsed.format, rows: parsed.rows, skipped: parsed.skipped, stepMinutes: parsed.stepMinutes, at: now,
  }].slice(-MAX_FILE_HISTORY);

  const meta = {
    name,
    symbol: pair,
    spread: effectiveSpread,
    spreadSource,
    tz,
    candles: candles.length,
    from: candles[0].time,
    to: candles[candles.length - 1].time,
    m1Rows: files.reduce((n, f) => n + f.rows, 0),
    stepMinutes: parsed.stepMinutes,
    trainCutoff: cutoff,
    cutoffKind: kind,
    files,
    updatedAt: now,
  };

  writeAtomic(csvPathFor(dir, name), candlesToCsv(candles));
  writeAtomic(metaPathFor(dir, name), JSON.stringify(meta));
  return { file: files[files.length - 1], dataset: meta };
}

export function deleteDataset(dir, name) {
  if (!isValidDatasetName(name)) throw new ImportError('Nom de jeu de données invalide.');
  if (!readDatasetMeta(dir, name)) return false;
  for (const f of [csvPathFor(dir, name), metaPathFor(dir, name)]) fs.rmSync(f, { force: true });
  return true;
}
