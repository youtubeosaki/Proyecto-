import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import {
  ConfigError,
  HumanInputRequiredError,
  OsakiError,
  createLogger,
  loadConfig,
  type Stage,
} from '@osaki/core';
import { ApprovalRepository, VideoRepository, openDatabase } from '@osaki/db';
import { chooseAngle, readAngles } from '@osaki/script';
import { json, matchRoute, readJsonBody, serveVideo, type Route } from './http.js';

const log = createLogger('server');

/**
 * PUENTE HTTP ENTRE n8n Y EL PIPELINE
 *
 * n8n corre en Docker Desktop y el pipeline en Windows, asi que el nodo
 * "Execute Command" no sirve: ejecutaria dentro del contenedor, donde no hay
 * ni repositorio ni Remotion ni ffmpeg. Un servidor local que n8n llama por
 * HTTP resuelve eso limpiamente.
 *
 * Desde el contenedor, el host se alcanza en `host.docker.internal`.
 *
 * SEGURIDAD. Para que el contenedor llegue, el servidor tiene que escuchar en
 * 0.0.0.0, no en 127.0.0.1, y eso lo deja visible en la red local. Por eso
 * exige un token compartido y se NIEGA A ARRANCAR sin el: un endpoint que
 * dispara renders y aprueba publicaciones no puede quedar abierto porque
 * alguien no leyo la documentacion.
 */

export interface ServerOptions {
  port?: number;
  /** Inyectado desde la CLI para no crear una dependencia circular. */
  runStage: (stage: Stage, videoId: string | null) => Promise<{ summary: string[] }>;
}

/** Comparacion en tiempo constante: una comparacion normal filtra el token. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createOsakiServer(options: ServerOptions) {
  const config = loadConfig();

  if (!config.N8N_WEBHOOK_TOKEN) {
    throw new ConfigError(
      'El servidor necesita N8N_WEBHOOK_TOKEN en .env.\n' +
        '  Tiene que escuchar en 0.0.0.0 para que n8n lo alcance desde Docker,\n' +
        '  asi que sin token quedaria abierto a la red local. Genera uno:\n' +
        '    PowerShell:  [guid]::NewGuid().ToString("N")',
    );
  }

  const db = openDatabase();
  const videos = new VideoRepository(db);
  const approvals = new ApprovalRepository(db);

  const routes: Route[] = [
    {
      method: 'GET',
      pattern: '/health',
      handler: () => ({ ok: true, provider: config.LLM_PROVIDER, voice: config.VOICE_PROVIDER }),
    },

    {
      method: 'GET',
      pattern: '/videos',
      handler: () => ({ videos: videos.list() }),
    },

    {
      method: 'POST',
      pattern: '/videos',
      handler: ({ body }) => {
        const title = (body as { title?: string }).title;
        if (!title) throw new OsakiError('Falta "title" en el cuerpo.');
        return { video: videos.create({ title }) };
      },
    },

    {
      method: 'POST',
      pattern: '/videos/:id/stages/:stage',
      handler: async ({ params }) => {
        const stage = params.stage as Stage;
        const result = await options.runStage(stage, params.id ?? null);
        return { stage, videoId: params.id, summary: result.summary };
      },
    },

    /** Etapa global: alimenta el banco de ideas y no pertenece a un video. */
    {
      method: 'POST',
      pattern: '/stages/ideas',
      handler: async () => ({ summary: (await options.runStage('ideas', null)).summary }),
    },

    /**
     * GATE #1. Devuelve las tres propuestas para pintarlas en el formulario.
     */
    {
      method: 'GET',
      pattern: '/videos/:id/angles',
      handler: ({ params }) => readAngles(params.id!),
    },

    {
      method: 'POST',
      pattern: '/videos/:id/choose',
      handler: ({ params, body }) => {
        const { angleId, notes } = body as { angleId?: string; notes?: string };
        if (!angleId) throw new OsakiError('Falta "angleId" en el cuerpo.');

        const updated = chooseAngle(params.id!, angleId, notes);
        approvals.record({
          videoId: params.id!,
          gate: 'angles',
          decision: 'approved',
          notes,
          edited: { chosenAngleId: angleId, alternatives: updated.angles.map((a) => a.id) },
        });

        return { chosenAngleId: angleId, notes };
      },
    },

    /**
     * GATE #2. Sirve el master para que lo veas dentro del formulario.
     */
    {
      method: 'GET',
      pattern: '/videos/:id/render',
      handler: ({ params, request, response }) => {
        const path = join(config.paths.renders, params.id!, 'master.mp4');
        if (!existsSync(path)) {
          throw new OsakiError(`Todavia no hay render para ${params.id}.`);
        }
        serveVideo(request, response, path);
        return undefined;
      },
    },

    {
      method: 'POST',
      pattern: '/videos/:id/approve',
      handler: ({ params, body }) => {
        const { gate, decision, notes } = body as {
          gate?: 'angles' | 'render';
          decision?: 'approved' | 'rejected' | 'changes_requested';
          notes?: string;
        };

        if (gate !== 'angles' && gate !== 'render') {
          throw new OsakiError('El gate debe ser "angles" o "render".');
        }

        approvals.record({
          videoId: params.id!,
          gate,
          decision: decision ?? 'approved',
          notes,
        });

        log.info(`gate ${gate} de ${params.id}: ${decision ?? 'approved'}`);
        return { gate, decision: decision ?? 'approved' };
      },
    },

    /** Lo que consulta n8n antes de dejar avanzar hacia la publicacion. */
    {
      method: 'GET',
      pattern: '/videos/:id/approved/:gate',
      handler: ({ params }) => {
        const gate = params.gate as 'angles' | 'render';
        return { gate, approved: approvals.isApproved(params.id!, gate) };
      },
    },
  ];

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void handle(request, response);
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');

    // El token puede ir por cabecera (n8n) o por query (el <video> de un
    // formulario no puede poner cabeceras).
    const provided =
      request.headers['x-osaki-token']?.toString() ?? url.searchParams.get('token') ?? '';

    if (url.pathname !== '/health' && !tokenMatches(provided, config.N8N_WEBHOOK_TOKEN!)) {
      json(response, 401, { error: 'Token invalido o ausente.' });
      return;
    }

    const matched = matchRoute(routes, request.method ?? 'GET', url.pathname);
    if (!matched) {
      json(response, 404, { error: `Sin ruta para ${request.method} ${url.pathname}` });
      return;
    }

    try {
      const body = request.method === 'POST' ? await readJsonBody(request) : {};
      const result = await matched.route.handler({
        request,
        response,
        params: matched.params,
        query: url.searchParams,
        body,
      });

      // Un handler que ya escribio la respuesta (el video) devuelve undefined.
      if (result !== undefined) json(response, 200, result);
    } catch (error) {
      /**
       * Un gate humano pendiente NO es un error del servidor: es el pipeline
       * esperando a una persona. Se devuelve 409 para que n8n lo distinga de
       * un fallo real y ponga el flujo en espera en vez de reintentar.
       */
      if (error instanceof HumanInputRequiredError) {
        json(response, 409, {
          awaitingHuman: true,
          message: error.message,
          instructions: error.instructions,
        });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      log.error(`${request.method} ${url.pathname}: ${message}`);
      json(response, error instanceof OsakiError ? 400 : 500, { error: message });
    }
  }
}

export function startOsakiServer(options: ServerOptions): void {
  const config = loadConfig();
  const port = options.port ?? 4599;
  const server = createOsakiServer(options);

  server.listen(port, '0.0.0.0', () => {
    log.info(`escuchando en http://localhost:${port}`);
    log.info(`desde n8n en Docker:  http://host.docker.internal:${port}`);
    log.info(`proveedor LLM: ${config.LLM_PROVIDER}   voz: ${config.VOICE_PROVIDER}`);
  });
}
