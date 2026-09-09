import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Utilidades HTTP minimas. Sin framework: son cinco rutas y un servidor local.
 */

export interface RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type RouteHandler = (context: RouteContext) => Promise<unknown> | unknown;

export interface Route {
  method: 'GET' | 'POST';
  /** Patron con segmentos `:nombre`, p.ej. `/videos/:id/approve`. */
  pattern: string;
  handler: RouteHandler;
}

export function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

export function matchRoute(
  routes: readonly Route[],
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  const parts = pathname.split('/').filter(Boolean);

  for (const route of routes) {
    if (route.method !== method) continue;

    const patternParts = route.pattern.split('/').filter(Boolean);
    if (patternParts.length !== parts.length) continue;

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < patternParts.length; i++) {
      const expected = patternParts[i]!;
      const actual = parts[i]!;

      if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
      else if (expected !== actual) {
        matched = false;
        break;
      }
    }

    if (matched) return { route, params };
  }

  return null;
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    // Techo defensivo: ningun cuerpo legitimo de esta API llega a 1 MB, y sin
    // limite un cliente puede agotar la memoria del proceso.
    if (size > 1_000_000) throw new Error('El cuerpo de la peticion es demasiado grande.');
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('El cuerpo de la peticion no es JSON valido.');
  }
}

/**
 * Sirve un archivo de video con soporte de rangos.
 *
 * El soporte de `Range` no es opcional aqui: sin el, el elemento <video> del
 * formulario de aprobacion reproduce pero no deja saltar por la barra. Y
 * revisar un video de diez minutos sin poder saltar no es revisarlo.
 */
export function serveVideo(request: IncomingMessage, response: ServerResponse, path: string): void {
  const { size } = statSync(path);
  const range = request.headers.range;

  if (!range) {
    response.writeHead(200, { 'content-type': 'video/mp4', 'content-length': size });
    createReadStream(path).pipe(response);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : size - 1;

  if (start >= size || end >= size || start > end) {
    response.writeHead(416, { 'content-range': `bytes */${size}` });
    response.end();
    return;
  }

  response.writeHead(206, {
    'content-type': 'video/mp4',
    'content-range': `bytes ${start}-${end}/${size}`,
    'accept-ranges': 'bytes',
    'content-length': end - start + 1,
  });
  createReadStream(path, { start, end }).pipe(response);
}
