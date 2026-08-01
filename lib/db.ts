import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('Team', 'Person', 'Task', 'Decision', 'Blocker')),
  label         TEXT NOT NULL,
  teamId        TEXT,
  status        TEXT CHECK (
    status IS NULL OR status IN ('not_started', 'in_progress', 'blocked', 'at_risk', 'done')
  ),
  summary       TEXT,
  ownerId       TEXT,
  dueDate       TEXT,
  discordUserId TEXT,
  updatedAt     TEXT NOT NULL,
  sourceRef     TEXT            -- JSON blob of SourceRef
);
CREATE INDEX IF NOT EXISTS idx_nodes_team    ON nodes(teamId);
CREATE INDEX IF NOT EXISTS idx_nodes_type    ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_discord ON nodes(discordUserId);

CREATE TABLE IF NOT EXISTS edges (
  id        TEXT PRIMARY KEY,
  from_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type      TEXT NOT NULL CHECK (
    type IN ('MEMBER_OF', 'OWNS', 'DEPENDS_ON', 'BLOCKS', 'CONFLICTS_WITH')
  ),
  note      TEXT,
  updatedAt TEXT NOT NULL,
  sourceRef TEXT
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);

CREATE TABLE IF NOT EXISTS reminders (
  id                 TEXT PRIMARY KEY,
  task_key           TEXT NOT NULL,
  title              TEXT NOT NULL,
  owner              TEXT NOT NULL,
  team               TEXT NOT NULL,
  due_label          TEXT NOT NULL,
  progress           INTEGER NOT NULL CHECK (progress >= 0 AND progress <= 100),
  task_state         TEXT NOT NULL CHECK (task_state IN ('Active', 'Review', 'Blocked')),
  channel_id         TEXT NOT NULL,
  remind_at          TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'sent', 'failed')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  discord_message_id TEXT,
  last_error         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_task ON reminders(task_key, status);

CREATE TABLE IF NOT EXISTS plan_deliveries (
  id          TEXT PRIMARY KEY,
  sourceName  TEXT NOT NULL,
  generatedAt TEXT NOT NULL,
  payload     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_deliveries_generated
  ON plan_deliveries(generatedAt DESC);

CREATE TABLE IF NOT EXISTS plan_dispatch_receipts (
  planId        TEXT NOT NULL,
  ownerKey      TEXT NOT NULL,
  ownerId       TEXT,
  owner         TEXT NOT NULL,
  discordUserId TEXT,
  status        TEXT NOT NULL CHECK (status IN ('sent', 'unmatched', 'failed')),
  messageId     TEXT,
  detail        TEXT,
  updatedAt     TEXT NOT NULL,
  PRIMARY KEY (planId, ownerKey)
);
CREATE INDEX IF NOT EXISTS idx_plan_dispatch_status
  ON plan_dispatch_receipts(planId, status);

CREATE TABLE IF NOT EXISTS plan_followups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  planId      TEXT NOT NULL,
  teamId      TEXT,
  teamLabel   TEXT,
  ownerKeys   TEXT NOT NULL,  -- JSON array of handoff ownerKeys to (re)dispatch
  requestedAt TEXT NOT NULL,
  consumedAt  TEXT
);
CREATE INDEX IF NOT EXISTS idx_plan_followups_pending
  ON plan_followups(consumedAt, id);
`;

type AthenaGlobal = typeof globalThis & {
  __athenaDatabase?: { path: string; connection: Database.Database };
};

export function databasePath(): string {
  // On Vercel the deployment bundle is read-only; open a copy under /tmp
  // (seeded from data/athena-seed.db) so routes can still write. Data there
  // is per-instance and resets on cold start — demo-grade persistence only.
  if (process.env.VERCEL) {
    return '/tmp/athena.db';
  }
  const file = process.env.DATABASE_PATH || './athena.db';
  return path.resolve(process.cwd(), file);
}

function seedDatabaseFile(target: string): void {
  if (!process.env.VERCEL) return;
  if (fs.existsSync(target)) return;
  const seed = path.resolve(process.cwd(), 'data/athena-seed.db');
  if (fs.existsSync(seed)) {
    fs.copyFileSync(seed, target);
  }
}

export function getDb(): Database.Database {
  const file = databasePath();
  const globalCache = globalThis as AthenaGlobal;

  if (globalCache.__athenaDatabase?.path === file) {
    return globalCache.__athenaDatabase.connection;
  }

  if (globalCache.__athenaDatabase) {
    globalCache.__athenaDatabase.connection.close();
    delete globalCache.__athenaDatabase;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  seedDatabaseFile(file);
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
  globalCache.__athenaDatabase = { path: file, connection: db };
  return db;
}

/** Drop every row. Used by `npm run seed`; never call this from a route. */
export function resetDb(): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM reminders').run();
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  })();
}

/** Close the singleton connection. Primarily useful for tests and scripts. */
export function closeDb(): void {
  const globalCache = globalThis as AthenaGlobal;
  globalCache.__athenaDatabase?.connection.close();
  delete globalCache.__athenaDatabase;
}
