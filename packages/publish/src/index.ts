import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  OsakiError,
  createLogger,
  loadConfig,
  writeArtifact,
  type Config,
} from '@osaki/core';
import { ApprovalRepository, VideoRepository, openDatabase } from '@osaki/db';
import { fetchPerformance, type VideoPerformance } from './analytics.js';
import { QUOTA_COST, remainingToday, reserveQuota } from './quota.js';
import { setThumbnail, uploadVideo, type Privacy } from './youtube.js';

export * from './analytics.js';
export * from './oauth.js';
export * from './quota.js';
export * from './youtube.js';

const log = createLogger('publish');

export interface PublishResult {
  youtubeVideoId: string;
  privacy: Privacy;
  url: string;
  thumbnailUploaded: boolean;
}

/**
 * Etapa 9: publicacion.
 *
 * La primera linea del cuerpo es la comprobacion del gate humano, y esta
 * antes de leer nada mas a proposito: es la condicion que da sentido a todo
 * el diseño del pipeline, no un paso de validacion mas.
 */
export async function runPublishStage(
  videoId: string,
  packaging: { titles: { text: string }[]; description: string; tags: string[] },
  options: { titleIndex?: number; privacy?: Privacy; publishAt?: string } = {},
): Promise<PublishResult> {
  const config = loadConfig();
  const db = openDatabase();

  if (!new ApprovalRepository(db).isApproved(videoId, 'render')) {
    throw new OsakiError(
      `No se puede publicar ${videoId}: falta la aprobacion humana del render.\n` +
        `  Revisa el video y luego:  pnpm osaki approve render --video ${videoId}`,
      { stage: 'publish' },
    );
  }

  const masterPath = join(config.paths.renders, videoId, 'master.mp4');
  if (!existsSync(masterPath)) {
    throw new OsakiError(`No existe el render en ${masterPath}.`, { stage: 'publish' });
  }

  const privacy: Privacy = options.privacy ?? config.YOUTUBE_DEFAULT_PRIVACY;
  const title = packaging.titles[options.titleIndex ?? packaging.titles.length - 1]?.text;
  if (!title) throw new OsakiError('El empaque no tiene ningun titulo.', { stage: 'publish' });

  log.info(`quedan ${remainingToday(db)} unidades de cuota hoy`);
  reserveQuota(db, QUOTA_COST.upload, `upload ${videoId}`);

  const youtubeVideoId = await uploadVideo(config, {
    filePath: masterPath,
    title,
    description: packaging.description,
    tags: packaging.tags,
    privacy,
    publishAt: options.publishAt,
  });

  new VideoRepository(db).markPublished(videoId, youtubeVideoId);

  /**
   * La miniatura va aparte y su fallo no tumba la etapa: el video ya esta
   * subido, y volver a ejecutar la etapa lo subiria dos veces. Mejor dejarlo
   * publicado sin miniatura y avisar.
   */
  let thumbnailUploaded = false;
  const thumbnailPath = join(config.paths.renders, videoId, 'thumb-1.png');

  if (existsSync(thumbnailPath)) {
    try {
      reserveQuota(db, QUOTA_COST.thumbnail, `thumbnail ${videoId}`);
      await setThumbnail(config, youtubeVideoId, thumbnailPath);
      thumbnailUploaded = true;
    } catch (error) {
      log.warn(
        'el video quedo subido pero la miniatura fallo; ponla a mano en Studio',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const result: PublishResult = {
    youtubeVideoId,
    privacy,
    url: `https://studio.youtube.com/video/${youtubeVideoId}/edit`,
    thumbnailUploaded,
  };

  writeArtifact(videoId, 'publish', { ...result, publishedAt: new Date().toISOString() });
  return result;
}

/**
 * Etapa 11: analitica de retorno.
 *
 * A los siete dias lee el rendimiento real y lo guarda. Ese historico es lo
 * que alimenta el scoring del banco de ideas: en vez de puntuar a ciegas, el
 * modelo ve que funciono de verdad en ESTE canal.
 */
export async function runAnalyticsStage(
  videoId: string,
  options: { days?: number } = {},
): Promise<VideoPerformance> {
  const config = loadConfig();
  const db = openDatabase();
  const video = new VideoRepository(db).find(videoId);

  if (!video?.youtubeVideoId || !video.publishedAt) {
    throw new OsakiError(`El video ${videoId} no esta publicado todavia.`, { stage: 'analytics' });
  }

  const days = options.days ?? 7;
  const elapsed = (Date.now() - new Date(video.publishedAt).getTime()) / 86_400_000;

  if (elapsed < days) {
    // Aviso y no error: leer a los tres dias da datos, solo que menos
    // estables. Bloquearlo obligaria a esperar sin poder mirar nada.
    log.warn(`solo han pasado ${elapsed.toFixed(1)} dias de los ${days} previstos`);
  }

  reserveQuota(db, QUOTA_COST.read * 2, `analytics ${videoId}`);
  const performance = await fetchPerformance(config, video.youtubeVideoId, video.publishedAt, days);

  db.prepare(
    `INSERT INTO analytics_snapshots
       (video_id, captured_at, days_since_publish, views, ctr, avg_view_duration, retention_30s, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    videoId,
    new Date().toISOString(),
    Math.round(elapsed),
    performance.views,
    performance.ctr,
    performance.averageViewDuration,
    performance.retention30s,
    JSON.stringify(performance.raw),
  );

  writeArtifact(videoId, 'analytics', performance);
  log.info(
    `${performance.views} visualizaciones, CTR ${performance.ctr !== null ? (performance.ctr * 100).toFixed(1) + '%' : 'n/d'}`,
  );

  return performance;
}

/**
 * Lo que aprendio el canal, para inyectarlo en el prompt de scoring.
 *
 * Se pasan los que mejor y peor funcionaron, no una media: una media no dice
 * nada accionable, mientras que "estos tres engancharon y estos tres no" si
 * calibra al modelo sobre este canal en concreto.
 */
export function channelLearnings(limit = 4): { best: string[]; worst: string[] } {
  const rows = openDatabase()
    .prepare(
      `SELECT v.title, a.retention_30s, a.ctr
       FROM analytics_snapshots a
       JOIN videos v ON v.id = a.video_id
       WHERE a.retention_30s IS NOT NULL
       ORDER BY a.retention_30s DESC`,
    )
    .all() as { title: string; retention_30s: number; ctr: number | null }[];

  const describe = (row: (typeof rows)[number]) =>
    `${row.title}  (retencion 30s ${(row.retention_30s * 100).toFixed(0)}%` +
    (row.ctr !== null ? `, CTR ${(row.ctr * 100).toFixed(1)}%)` : ')');

  return {
    best: rows.slice(0, limit).map(describe),
    worst: rows.slice(-limit).reverse().map(describe),
  };
}
