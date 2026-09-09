/**
 * Migraciones. Se aplican en orden y se registran en `schema_migrations`,
 * asi que arrancar dos veces no duplica nada.
 *
 * Regla: nunca edites una migracion ya aplicada. Anade otra.
 */

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
      CREATE TABLE ideas (
        id             TEXT PRIMARY KEY,
        title          TEXT NOT NULL,
        summary        TEXT NOT NULL DEFAULT '',
        source_type    TEXT NOT NULL,
        source_url     TEXT,
        -- Hash del titulo normalizado. UNIQUE es lo que impide que el mismo
        -- tema entre dos veces desde dos feeds distintos.
        dedupe_key     TEXT NOT NULL UNIQUE,
        score_json     TEXT,
        composite_score REAL,
        discovered_at  TEXT NOT NULL,
        consumed_by    TEXT REFERENCES videos(id)
      );

      CREATE INDEX idx_ideas_score ON ideas(composite_score DESC);

      CREATE TABLE videos (
        id               TEXT PRIMARY KEY,
        slug             TEXT NOT NULL,
        title            TEXT NOT NULL,
        idea_id          TEXT REFERENCES ideas(id),
        stage            TEXT NOT NULL,
        status           TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        published_at     TEXT,
        youtube_video_id TEXT
      );

      CREATE INDEX idx_videos_stage ON videos(stage, status);

      -- Una fila por ejecucion de etapa. Es el registro que permite reejecutar
      -- la etapa 6 sin tocar la 1: cada etapa lee el artefacto de la anterior.
      CREATE TABLE stage_runs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        stage         TEXT NOT NULL,
        status        TEXT NOT NULL,
        started_at    TEXT NOT NULL,
        finished_at   TEXT,
        -- Ruta del artefacto en disco. La DB guarda punteros, no payloads.
        artifact_path TEXT,
        error_message TEXT,
        attempt       INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX idx_stage_runs_video ON stage_runs(video_id, stage);

      -- Las aprobaciones humanas quedan registradas. Si YouTube pregunta
      -- por el aporte creativo humano, esta es la evidencia.
      CREATE TABLE approvals (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id    TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        gate        TEXT NOT NULL,
        decision    TEXT NOT NULL,
        notes       TEXT,
        edited_json TEXT,
        decided_at  TEXT NOT NULL
      );

      CREATE INDEX idx_approvals_video ON approvals(video_id, gate);

      CREATE TABLE claims (
        id                TEXT PRIMARY KEY,
        video_id          TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        statement         TEXT NOT NULL,
        supporting_quote  TEXT,
        source_url        TEXT,
        source_title      TEXT,
        source_tier       TEXT,
        verified          INTEGER NOT NULL DEFAULT 0,
        verification_note TEXT,
        created_at        TEXT NOT NULL
      );

      CREATE INDEX idx_claims_video ON claims(video_id, verified);

      CREATE TABLE analytics_snapshots (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id           TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        captured_at        TEXT NOT NULL,
        days_since_publish INTEGER NOT NULL,
        views              INTEGER,
        ctr                REAL,
        avg_view_duration  REAL,
        retention_30s      REAL,
        raw_json           TEXT
      );

      CREATE INDEX idx_analytics_video ON analytics_snapshots(video_id, days_since_publish);
    `,
  },
];
