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

  CREATE TABLE IF NOT EXISTS atr_backtest_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker          TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    reset_threshold REAL NOT NULL,
    ran_at          TEXT NOT NULL,
    peak_count      INTEGER NOT NULL,
    max_mult        REAL NOT NULL,
    avg_mult        REAL NOT NULL,
    median_mult     REAL NOT NULL,
    above7_count    INTEGER NOT NULL,
    above7_pct      REAL NOT NULL,
    results_json    TEXT NOT NULL
  );
`);

// ─── Migrations ───────────────────────────────────────────────────────────────
try { db.exec(`ALTER TABLE positions   ADD COLUMN atr_sell_threshold   REAL`);      } catch (_) { /* already exists */ }
try { db.exec(`ALTER TABLE evaluations ADD COLUMN stage_confidence       TEXT`);    } catch (_) { /* already exists */ }
try { db.exec(`ALTER TABLE evaluations ADD COLUMN stage_from            INTEGER`); } catch (_) { /* already exists */ }
try { db.exec(`ALTER TABLE evaluations ADD COLUMN stage_to              INTEGER`); } catch (_) { /* already exists */ }
try { db.exec(`ALTER TABLE evaluations ADD COLUMN prescreen_stage       INTEGER`); } catch (_) { /* already exists */ }
try { db.exec(`ALTER TABLE evaluations ADD COLUMN prescreen_confidence  TEXT`);    } catch (_) { /* already exists */ }
try { db.exec(`ALTER TABLE evaluations ADD COLUMN prescreen_reasoning   TEXT`);    } catch (_) { /* already exists */ }

// Migrate legacy `stage` strings ("Stage 1", "Stage 1-2", "1", "1-2") → stage_from / stage_to
db.exec(`
  UPDATE evaluations
  SET
    stage_from = CAST(
      CASE
        WHEN stage GLOB 'Stage [1-4]-[1-4]' THEN substr(stage, 7, 1)
        WHEN stage GLOB '[1-4]-[1-4]'        THEN substr(stage, 1, 1)
        WHEN stage GLOB 'Stage [1-4]*'       THEN substr(stage, 7, 1)
        WHEN stage GLOB '[1-4]'              THEN stage
        ELSE NULL
      END AS INTEGER
    ),
    stage_to = CAST(
      CASE
        WHEN stage GLOB 'Stage [1-4]-[1-4]' THEN substr(stage, 9, 1)
        WHEN stage GLOB '[1-4]-[1-4]'        THEN substr(stage, 3, 1)
        ELSE NULL
      END AS INTEGER
    )
  WHERE stage IS NOT NULL AND stage_from IS NULL;
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
