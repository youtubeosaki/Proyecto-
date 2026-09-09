import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { z } from 'zod';
import { loadConfig } from './config.js';
import { OsakiError } from './errors.js';
import type { Stage } from './types.js';

/**
 * ALMACEN DE ARTEFACTOS
 *
 * Cada etapa deja su resultado en `data/videos/<videoId>/<stage>.json` y la
 * siguiente lo lee de ahi. La base de datos guarda punteros, no payloads.
 *
 * Por que en disco y no en SQLite: estos artefactos se leen y se corrigen a
 * mano. Un guion que casi funciona se arregla editando el JSON y reejecutando
 * la etapa siguiente. Una columna BLOB no se edita, no se diffea y no se
 * versiona.
 *
 * Es tambien lo que hace que un fallo en la etapa 6 no obligue a repetir la 1.
 */

export function artifactPath(videoId: string, stage: Stage): string {
  return join(loadConfig().paths.videos, videoId, `${stage}.json`);
}

export function writeArtifact<T>(videoId: string, stage: Stage, data: T): string {
  const path = artifactPath(videoId, stage);
  mkdirSync(dirname(path), { recursive: true });
  // Indentado a proposito: estos archivos se abren y se editan a mano.
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return path;
}

export function hasArtifact(videoId: string, stage: Stage): boolean {
  return existsSync(artifactPath(videoId, stage));
}

/**
 * Lee y VALIDA el artefacto de una etapa.
 *
 * La validacion no es ceremonia: estos archivos se editan a mano, asi que la
 * forma en que se rompen es que a alguien se le va una coma. Vale mucho mas
 * fallar aqui con la ruta y el campo exactos que arrastrar un `undefined`
 * hasta el render.
 */
export function readArtifact<T>(
  videoId: string,
  stage: Stage,
  // El tercer parametro fija T al tipo de SALIDA del schema. Con
  // `z.ZodType<T>` a secas, TS lo liga al de entrada cuando el schema tiene
  // `.default()`, y entonces los campos con default salen opcionales aunque
  // despues de parsear esten siempre presentes.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T {
  const path = artifactPath(videoId, stage);

  if (!existsSync(path)) {
    throw new OsakiError(
      `Falta el artefacto de la etapa "${stage}" para ${videoId}.\n  Esperado en: ${path}\n` +
        `  Ejecuta primero:  pnpm osaki run ${stage} --video ${videoId}`,
      { stage },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new OsakiError(`El artefacto ${path} no es JSON valido.`, { stage, cause: error });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new OsakiError(`El artefacto ${path} no cumple su contrato:\n${problems}`, { stage });
  }

  return result.data;
}
