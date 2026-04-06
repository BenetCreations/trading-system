import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'trading.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    setup_type TEXT NOT NULL,
    tier INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    exit_date TEXT NOT NULL,
    entry_price REAL NOT NULL,
    stop_price REAL NOT NULL,
    exit_price REAL NOT NULL,
    shares INTEGER NOT NULL,
    regime INTEGER NOT NULL,
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    entry_price REAL NOT NULL,
    current_price REAL NOT NULL,
    stop_price REAL NOT NULL,
    shares INTEGER NOT NULL,
    tranche INTEGER NOT NULL DEFAULT 1,
    sector TEXT NOT NULL,
    setup_type TEXT NOT NULL,
    tier INTEGER NOT NULL,
    earnings_date TEXT,
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evaluations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker           TEXT NOT NULL,
    timestamp        TEXT NOT NULL,
    stage            TEXT,
    verdict          TEXT,
    setup_type       TEXT,
    evaluation_text  TEXT NOT NULL,
    indicators_json  TEXT,
    files_loaded     TEXT,
    model            TEXT,
    request_type     TEXT,
    enrichment_json  TEXT
  );
`);

const configCount = (db.prepare('SELECT COUNT(*) as count FROM config').get() as { count: number }).count;
if (configCount === 0) {
  const insert = db.prepare('INSERT INTO config (key, value) VALUES (?, ?)');
  const seedMany = db.transaction(() => {
    insert.run('starting_equity', '100000');
    insert.run('current_regime', '1');
    insert.run('market_stage', '2');
    insert.run('target_positions', '10');
    insert.run('regime_start_date', '');
  });
  seedMany();
}

export default db;
