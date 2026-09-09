import { createLogger, loadConfig, type Idea } from '@osaki/core';
import { openDatabase } from '@osaki/db';
import { createLlmProvider } from '@osaki/llm';
import { dedupeWithin } from './dedupe.js';
import { fetchAllSources } from './fetchers.js';
import { compositeScore, scoreIdeas } from './score.js';

export * from './dedupe.js';
export * from './fetchers.js';
export * from './score.js';
export * from './sources.js';

const log = createLogger('ingest');

export interface IdeasResult {
  fetched: number;
  afterDedupe: number;
  inserted: number;
  top: Idea[];
}

/**
 * Etapa 1: banco de ideas.
 *
 * Recoge, deduplica dentro del lote, descarta lo que ya conocemos, puntua lo
 * que queda y lo guarda ordenado.
 *
 * La deduplicacion se hace en dos niveles y ese orden importa: primero dentro
 * del lote, para no gastar tokens puntuando el mismo tema tres veces, y luego
 * contra la base, que es la que recuerda lo que ya se publico.
 */
export async function runIdeasStage(options: { limit?: number } = {}): Promise<IdeasResult> {
  const { limit = 12 } = options;
  const db = openDatabase();

  const fetched = await fetchAllSources();
  const unique = dedupeWithin(fetched);

  const known = new Set(
    db
      .prepare('SELECT dedupe_key FROM ideas')
      .all()
      .map((row) => (row as { dedupe_key: string }).dedupe_key),
  );

  const fresh = unique.filter((idea) => !known.has(idea.dedupeKey));
  log.info(`${fresh.length} ideas nuevas de ${unique.length} unicas (${known.size} ya conocidas)`);

  if (fresh.length === 0) {
    return { fetched: fetched.length, afterDedupe: unique.length, inserted: 0, top: [] };
  }

  const scored = await scoreIdeas(createLlmProvider(loadConfig()), fresh);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO ideas
       (id, title, summary, source_type, source_url, dedupe_key, score_json, composite_score, discovered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let inserted = 0;
  db.transaction(() => {
    for (const idea of scored) {
      const result = insert.run(
        idea.id,
        idea.title,
        idea.summary,
        idea.sourceType,
        idea.sourceUrl ?? null,
        idea.dedupeKey,
        idea.score ? JSON.stringify(idea.score) : null,
        idea.compositeScore ?? null,
        idea.discoveredAt,
      );
      inserted += result.changes;
    }
  })();

  const top = [...scored]
    .sort((a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1))
    .slice(0, limit);

  return { fetched: fetched.length, afterDedupe: unique.length, inserted, top };
}

/** Las mejores ideas guardadas, para elegir tema sin volver a ingerir. */
export function listTopIdeas(limit = 15): Idea[] {
  const rows = openDatabase()
    .prepare(
      `SELECT * FROM ideas
       WHERE consumed_by IS NULL
       ORDER BY composite_score DESC NULLS LAST
       LIMIT ?`,
    )
    .all(limit) as {
    id: string;
    title: string;
    summary: string;
    source_type: string;
    source_url: string | null;
    dedupe_key: string;
    score_json: string | null;
    composite_score: number | null;
    discovered_at: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    sourceType: row.source_type as Idea['sourceType'],
    sourceUrl: row.source_url ?? undefined,
    dedupeKey: row.dedupe_key,
    score: row.score_json ? JSON.parse(row.score_json) : undefined,
    compositeScore: row.composite_score ?? undefined,
    discoveredAt: row.discovered_at,
  }));
}

export { compositeScore };
