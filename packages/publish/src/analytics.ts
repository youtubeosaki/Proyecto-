import { ProviderError, createLogger, withRetry, type Config } from '@osaki/core';
import { getAccessToken } from './oauth.js';

const log = createLogger('youtube:analytics');

export interface VideoPerformance {
  youtubeVideoId: string;
  views: number;
  /** Click-through rate de las impresiones, 0..1. */
  ctr: number | null;
  /** Duracion media vista, en segundos. */
  averageViewDuration: number | null;
  /** Fraccion de espectadores que seguian a los 30 s, 0..1. */
  retention30s: number | null;
  raw: unknown;
}

const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';

async function query(
  config: Config,
  params: Record<string, string>,
): Promise<{ columnHeaders: { name: string }[]; rows?: (string | number)[][] }> {
  const accessToken = await getAccessToken(config);
  const url = `${ANALYTICS}?${new URLSearchParams(params).toString()}`;

  return withRetry(
    async () => {
      const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
      const text = await response.text();

      if (!response.ok) {
        throw new ProviderError(
          `Analytics devolvio ${response.status}: ${text.slice(0, 300)}`,
          { retryable: response.status >= 500 || response.status === 429 },
        );
      }

      return JSON.parse(text);
    },
    { logger: log, label: 'consulta de analytics' },
  );
}

function column(
  result: { columnHeaders: { name: string }[]; rows?: (string | number)[][] },
  name: string,
): number | null {
  const index = result.columnHeaders.findIndex((header) => header.name === name);
  const value = index >= 0 ? result.rows?.[0]?.[index] : undefined;
  return typeof value === 'number' ? value : null;
}

/**
 * Rendimiento de un video en una ventana de dias.
 *
 * Dos consultas y no una porque la retencion vive en un informe distinto: usa
 * la dimension `elapsedVideoTimeRatio`, que no se puede combinar con las
 * metricas agregadas en la misma peticion.
 */
export async function fetchPerformance(
  config: Config,
  youtubeVideoId: string,
  publishedAt: string,
  days = 7,
): Promise<VideoPerformance> {
  const start = publishedAt.slice(0, 10);
  const end = new Date(new Date(publishedAt).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const totals = await query(config, {
    ids: 'channel==MINE',
    startDate: start,
    endDate: end,
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,impressionsClickThroughRate',
    filters: `video==${youtubeVideoId}`,
  });

  /**
   * Retencion en el primer 5% del video. A treinta segundos de un video de
   * diez minutos eso es exactamente el arranque, que es donde se decide si
   * alguien se queda.
   */
  let retention30s: number | null = null;
  try {
    const curve = await query(config, {
      ids: 'channel==MINE',
      startDate: start,
      endDate: end,
      metrics: 'audienceWatchRatio',
      dimensions: 'elapsedVideoTimeRatio',
      filters: `video==${youtubeVideoId}`,
    });

    const ratioIndex = curve.columnHeaders.findIndex((h) => h.name === 'elapsedVideoTimeRatio');
    const watchIndex = curve.columnHeaders.findIndex((h) => h.name === 'audienceWatchRatio');

    // El punto mas cercano al 5% del video sin pasarse.
    const point = (curve.rows ?? [])
      .filter((row) => Number(row[ratioIndex]) <= 0.05)
      .sort((a, b) => Number(b[ratioIndex]) - Number(a[ratioIndex]))[0];

    if (point) retention30s = Number(point[watchIndex]);
  } catch (error) {
    // La curva de retencion no siempre esta disponible: exige un minimo de
    // visualizaciones. No tenerla no invalida el resto del informe.
    log.warn('sin curva de retencion todavia', error instanceof Error ? error.message : error);
  }

  return {
    youtubeVideoId,
    views: column(totals, 'views') ?? 0,
    ctr: column(totals, 'impressionsClickThroughRate'),
    averageViewDuration: column(totals, 'averageViewDuration'),
    retention30s,
    raw: totals,
  };
}
