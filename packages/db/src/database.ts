import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { createLogger, loadConfig } from '@osaki/core';
import { MIGRATIONS } from './schema.js';

const log = createLogger('db');

export type Db = Database.Database;

let instance: Db | null = null;

/**
 * Abre la base y aplica las migraciones pendientes.
 *
 * WAL importa aqui: n8n puede estar leyendo el estado mientras una etapa
 * escribe, y sin WAL eso son bloqueos.
 */
export function openDatabase(path?: string): Db {
  if (instance) return instance;

  const dbPath = path ?? loadConfig().paths.database;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  instance = db;
  return db;
}

export function closeDatabase(): void {
  instance?.close();
  instance = null;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => (row as { id: number }).id),
  );

  const record = db.prepare(
    'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    // Cada migracion es atomica: o entra entera o no entra.
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.id, migration.name, new Date().toISOString());
    })();

    log.info(`migracion aplicada: ${migration.id} ${migration.name}`);
  }
}
