import { ProviderError, createLogger, requireKeys, withRetry, type Config } from '@osaki/core';

const log = createLogger('youtube:oauth');

/**
 * Token de acceso a partir del refresh token.
 *
 * No se guarda en disco a proposito: dura una hora y renovarlo cuesta una
 * peticion. Un token de acceso cacheado en un archivo es un secreto mas que
 * custodiar a cambio de ahorrar medio segundo por ejecucion.
 *
 * El refresh token si vive en .env, porque ese no caduca y obtenerlo exige
 * pasar por el navegador.
 */

interface CachedToken {
  accessToken: string;
  /** Epoch en ms. */
  expiresAt: number;
}

let cached: CachedToken | null = null;

export async function getAccessToken(config: Config): Promise<string> {
  requireKeys(
    config,
    ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'],
    'La publicacion en YouTube',
  );

  // Margen de 60 s: un token que caduca a mitad de una subida de 90 MB
  // aborta la subida entera.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const body = new URLSearchParams({
    client_id: config.YOUTUBE_CLIENT_ID!,
    client_secret: config.YOUTUBE_CLIENT_SECRET!,
    refresh_token: config.YOUTUBE_REFRESH_TOKEN!,
    grant_type: 'refresh_token',
  });

  const payload = await withRetry(
    async () => {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });

      const text = await response.text();

      if (!response.ok) {
        /**
         * Un 400 aqui casi siempre significa refresh token revocado, y eso no
         * se arregla reintentando: hay que volver a autorizar en el navegador.
         */
        throw new ProviderError(
          `Google rechazo el refresh token (${response.status}): ${text.slice(0, 300)}`,
          { retryable: response.status >= 500 || response.status === 429 },
        );
      }

      return JSON.parse(text) as { access_token: string; expires_in: number };
    },
    { logger: log, label: 'refresh de token' },
  );

  cached = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  log.debug(`token renovado, valido ${Math.round(payload.expires_in / 60)} min`);
  return cached.accessToken;
}

/** Para tests y para forzar renovacion tras un 401. */
export function clearTokenCache(): void {
  cached = null;
}
