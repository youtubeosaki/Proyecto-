import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { OsakiError, ProviderError, createLogger, withRetry, type Config } from '@osaki/core';
import { getAccessToken, clearTokenCache } from './oauth.js';

const log = createLogger('youtube');

/**
 * PRIVACIDAD
 *
 * `public` NO esta en el tipo, a proposito.
 *
 * No es un valor por defecto que se pueda cambiar: es que el pipeline no
 * tiene forma de expresarlo. Publicar en abierto es una decision que se toma
 * en YouTube Studio, mirando el video, despues de haberlo aprobado. Si el
 * pipeline pudiera hacerlo, tarde o temprano un bug lo haria.
 */
export type Privacy = 'private' | 'unlisted';

export interface UploadRequest {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  privacy: Privacy;
  /** ISO 8601. Con fecha, YouTube lo publica solo llegado el momento. */
  publishAt?: string;
  /** 28 = Ciencia y tecnologia. */
  categoryId?: string;
}

/** Chunks de 8 MB: multiplo de 256 KB, que es lo que exige el protocolo. */
const CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Subida reanudable.
 *
 * Los masters de este canal pasan de 90 MB. Con la subida simple, un corte de
 * red a los ochenta megas obliga a empezar de cero; con la reanudable se
 * pregunta a Google cuanto recibio y se sigue desde ahi.
 */
export async function uploadVideo(config: Config, request: UploadRequest): Promise<string> {
  const { size } = statSync(request.filePath);
  const accessToken = await getAccessToken(config);

  const metadata = {
    snippet: {
      title: request.title.slice(0, 100),
      description: request.description.slice(0, 5000),
      tags: request.tags.slice(0, 30),
      categoryId: request.categoryId ?? '28',
    },
    status: {
      privacyStatus: request.privacy,
      ...(request.publishAt ? { publishAt: request.publishAt } : {}),
      selfDeclaredMadeForKids: false,
    },
  };

  // 1) Iniciar la sesion y obtener la URL de subida.
  const initResponse = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=utf-8',
        'x-upload-content-length': String(size),
        'x-upload-content-type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    },
  );

  if (!initResponse.ok) {
    if (initResponse.status === 401) clearTokenCache();
    throw new ProviderError(
      `YouTube rechazo el inicio de subida (${initResponse.status}): ${(await initResponse.text()).slice(0, 400)}`,
      { retryable: initResponse.status >= 500 },
    );
  }

  const uploadUrl = initResponse.headers.get('location');
  if (!uploadUrl) {
    throw new OsakiError('YouTube no devolvio la URL de subida reanudable.');
  }

  log.info(`subiendo ${(size / 1_048_576).toFixed(1)} MB en chunks de 8 MB`);

  // 2) Subir por chunks, preguntando a Google donde quedo tras cada fallo.
  let offset = 0;

  while (offset < size) {
    const end = Math.min(offset + CHUNK_SIZE, size) - 1;

    const uploaded = await withRetry(
      async () => {
        const stream = createReadStream(request.filePath, { start: offset, end });

        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'content-length': String(end - offset + 1),
            'content-range': `bytes ${offset}-${end}/${size}`,
          },
          body: Readable.toWeb(stream) as ReadableStream,
          // Node exige esto al mandar un stream como cuerpo.
          duplex: 'half',
        } as RequestInit & { duplex: 'half' });

        // 308: chunk aceptado, faltan mas.
        if (response.status === 308) {
          const range = response.headers.get('range');
          // Google dice cuanto tiene: se sigue desde ahi, no desde donde
          // creiamos. Si se reenvia un byte de mas, rechaza el chunk entero.
          return range ? Number(range.split('-')[1]) + 1 : end + 1;
        }

        if (response.ok) {
          const payload = (await response.json()) as { id?: string };
          if (!payload.id) throw new OsakiError('YouTube acepto la subida pero no devolvio id.');
          return { done: payload.id };
        }

        throw new ProviderError(
          `Chunk rechazado (${response.status}): ${(await response.text()).slice(0, 300)}`,
          { retryable: response.status >= 500 || response.status === 429 },
        );
      },
      { logger: log, label: `chunk ${offset}`, attempts: 5, baseDelayMs: 2000 },
    );

    if (typeof uploaded === 'object') {
      log.info(`subida completa: ${uploaded.done}`);
      return uploaded.done;
    }

    offset = uploaded;
    log.debug(`${((offset / size) * 100).toFixed(0)}%`);
  }

  throw new OsakiError('La subida termino sin que YouTube devolviera un id de video.');
}

/** Sube la miniatura. Falla sin tumbar la publicacion: el video ya esta arriba. */
export async function setThumbnail(
  config: Config,
  youtubeVideoId: string,
  imagePath: string,
): Promise<void> {
  const accessToken = await getAccessToken(config);
  const stream = createReadStream(imagePath);

  const response = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${youtubeVideoId}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'image/png' },
      body: Readable.toWeb(stream) as ReadableStream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' },
  );

  if (!response.ok) {
    throw new ProviderError(
      `No se pudo poner la miniatura (${response.status}): ${(await response.text()).slice(0, 300)}`,
      { retryable: response.status >= 500 },
    );
  }
}
