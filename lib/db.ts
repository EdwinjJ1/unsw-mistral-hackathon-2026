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
`;

type AthenaGlobal = typeof globalThis & {
  __athenaDatabase?: { path: string; connection: Database.Database };
};

export function databasePath(): string {
  const file = process.env.DATABASE_PATH || './athena.db';
  return path.resolve(process.cwd(), file);
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
