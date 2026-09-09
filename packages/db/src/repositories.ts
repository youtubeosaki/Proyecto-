import { makeId, slugify, type Claim, type Stage, type StageStatus, type VideoRecord } from '@osaki/core';
import type { Db } from './database.js';

const now = (): string => new Date().toISOString();

/* --------------------------------------------------------------------------
 * Videos
 * ----------------------------------------------------------------------- */

interface VideoRow {
  id: string;
  slug: string;
  title: string;
  idea_id: string | null;
  stage: string;
  status: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  youtube_video_id: string | null;
}

function toVideo(row: VideoRow): VideoRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    ideaId: row.idea_id ?? undefined,
    stage: row.stage as Stage,
    status: row.status as StageStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
    youtubeVideoId: row.youtube_video_id ?? undefined,
  };
}

export class VideoRepository {
  constructor(private readonly db: Db) {}

  create(input: { title: string; ideaId?: string }): VideoRecord {
    const timestamp = now();
    const record: VideoRecord = {
      id: makeId('vid'),
      slug: slugify(input.title),
      title: input.title,
      ideaId: input.ideaId,
      stage: 'ideas',
      status: 'done',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db
      .prepare(
        `INSERT INTO videos (id, slug, title, idea_id, stage, status, created_at, updated_at)
         VALUES (@id, @slug, @title, @ideaId, @stage, @status, @createdAt, @updatedAt)`,
      )
      .run({ ...record, ideaId: record.ideaId ?? null });

    return record;
  }

  find(id: string): VideoRecord | null {
    const row = this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as VideoRow | undefined;
    return row ? toVideo(row) : null;
  }

  list(filter: { stage?: Stage } = {}): VideoRecord[] {
    const rows = filter.stage
      ? (this.db
          .prepare('SELECT * FROM videos WHERE stage = ? ORDER BY created_at DESC')
          .all(filter.stage) as VideoRow[])
      : (this.db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all() as VideoRow[]);
    return rows.map(toVideo);
  }

  /** Avanza la maquina de estados. Es el unico sitio que escribe `stage`. */
  advance(id: string, stage: Stage, status: StageStatus): void {
    this.db
      .prepare('UPDATE videos SET stage = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(stage, status, now(), id);
  }

  markPublished(id: string, youtubeVideoId: string): void {
    this.db
      .prepare('UPDATE videos SET published_at = ?, youtube_video_id = ?, updated_at = ? WHERE id = ?')
      .run(now(), youtubeVideoId, now(), id);
  }
}

/* --------------------------------------------------------------------------
 * Ejecuciones de etapa
 * ----------------------------------------------------------------------- */

export class StageRunRepository {
  constructor(private readonly db: Db) {}

  start(videoId: string, stage: Stage): number {
    const previous = this.db
      .prepare('SELECT COUNT(*) AS n FROM stage_runs WHERE video_id = ? AND stage = ?')
      .get(videoId, stage) as { n: number };

    const result = this.db
      .prepare(
        `INSERT INTO stage_runs (video_id, stage, status, started_at, attempt)
         VALUES (?, ?, 'running', ?, ?)`,
      )
      .run(videoId, stage, now(), previous.n + 1);

    return Number(result.lastInsertRowid);
  }

  finish(runId: number, artifactPath?: string): void {
    this.db
      .prepare(`UPDATE stage_runs SET status = 'done', finished_at = ?, artifact_path = ? WHERE id = ?`)
      .run(now(), artifactPath ?? null, runId);
  }

  fail(runId: number, message: string): void {
    this.db
      .prepare(`UPDATE stage_runs SET status = 'failed', finished_at = ?, error_message = ? WHERE id = ?`)
      .run(now(), message, runId);
  }

  /**
   * Ultima ejecucion exitosa de una etapa. Es lo que permite que la etapa 6
   * se reejecute sola: pregunta por el artefacto de la 5 y sigue.
   */
  lastSuccessful(videoId: string, stage: Stage): { artifactPath: string | null } | null {
    const row = this.db
      .prepare(
        `SELECT artifact_path FROM stage_runs
         WHERE video_id = ? AND stage = ? AND status = 'done'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(videoId, stage) as { artifact_path: string | null } | undefined;

    return row ? { artifactPath: row.artifact_path } : null;
  }
}

/* --------------------------------------------------------------------------
 * Aprobaciones humanas
 * ----------------------------------------------------------------------- */

export type ApprovalDecision = 'approved' | 'rejected' | 'changes_requested';

export class ApprovalRepository {
  constructor(private readonly db: Db) {}

  record(input: {
    videoId: string;
    gate: 'angles' | 'render';
    decision: ApprovalDecision;
    notes?: string;
    edited?: unknown;
  }): void {
    this.db
      .prepare(
        `INSERT INTO approvals (video_id, gate, decision, notes, edited_json, decided_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.videoId,
        input.gate,
        input.decision,
        input.notes ?? null,
        input.edited === undefined ? null : JSON.stringify(input.edited),
        now(),
      );
  }

  /**
   * La pregunta que decide si un video puede subirse.
   * Si esto devuelve false, no hay ruta hacia YouTube.
   */
  isApproved(videoId: string, gate: 'angles' | 'render'): boolean {
    const row = this.db
      .prepare(
        `SELECT decision FROM approvals
         WHERE video_id = ? AND gate = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(videoId, gate) as { decision: string } | undefined;

    return row?.decision === 'approved';
  }
}

/* --------------------------------------------------------------------------
 * Afirmaciones verificadas
 * ----------------------------------------------------------------------- */

export class ClaimRepository {
  constructor(private readonly db: Db) {}

  replaceForVideo(videoId: string, claims: readonly Claim[]): void {
    const insert = this.db.prepare(
      `INSERT INTO claims
         (id, video_id, statement, supporting_quote, source_url, source_title,
          source_tier, verified, verification_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM claims WHERE video_id = ?').run(videoId);
      for (const claim of claims) {
        insert.run(
          claim.id,
          videoId,
          claim.statement,
          claim.supportingQuote ?? null,
          claim.source?.url ?? null,
          claim.source?.title ?? null,
          claim.source?.tier ?? null,
          claim.verified ? 1 : 0,
          claim.verificationNote ?? null,
          now(),
        );
      }
    })();
  }

  countVerified(videoId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM claims WHERE video_id = ? AND verified = 1')
      .get(videoId) as { n: number };
    return row.n;
  }
}
