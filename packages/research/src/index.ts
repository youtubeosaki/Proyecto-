import { z } from 'zod';
import {
  ClaimSchema,
  FactSheetSchema,
  OsakiError,
  SourceSchema,
  createLogger,
  loadConfig,
  readArtifact,
  rejectedClaims,
  verifiedClaims,
  writeArtifact,
  type Claim,
  type FactSheet,
} from '@osaki/core';
import { ClaimRepository, openDatabase } from '@osaki/db';
import { completeJson, createLlmProvider, renderPrompt } from '@osaki/llm';
import { verifyClaims } from './verify.js';

export * from './verify.js';

const log = createLogger('research');

/**
 * Lo que devuelve la primera pasada. Deliberadamente mas permisivo que
 * `ClaimSchema`: el investigador puede devolver una fuente sin URL, y esa
 * decision la juzga la verificacion, no el parser. Fallar aqui tiraria el
 * lote entero por una afirmacion floja.
 */
const DraftSchema = z.object({
  topic: z.string(),
  claims: z.array(
    z.object({
      id: z.string(),
      statement: z.string(),
      supportingQuote: z.string().optional(),
      source: SourceSchema.partial({ retrievedAt: true, publisher: true })
        .extend({ url: z.string() })
        .optional(),
    }),
  ),
  // Sin `.default()`: con un default, el tipo que infiere TS del schema
  // depende de si mira la entrada o la salida, y aqui llega como opcional.
  // Mas claro resolverlo en el punto de uso.
  openQuestions: z.array(z.string()).optional(),
});

export interface ResearchResult {
  sheet: FactSheet;
  verified: number;
  rejected: number;
  artifactPath: string;
}

/**
 * Etapa 2: investigacion con verificacion.
 *
 * Es el nucleo del sistema. Todo lo demas del pipeline es logistica; esto es
 * lo que separa el canal de una granja de contenido, asi que va en el camino
 * critico y no como un paso opcional.
 *
 * Dos llamadas separadas a proposito: una investiga y otra revisa en contra.
 * En una sola pasada el modelo juzga su propio trabajo y lo aprueba casi todo.
 */
export async function runResearchStage(
  videoId: string,
  topic: string,
  options: { minClaims?: number; maxClaims?: number } = {},
): Promise<ResearchResult> {
  const config = loadConfig();
  const provider = createLlmProvider(config);
  const { minClaims = 12, maxClaims = 22 } = options;

  log.info(`investigando: ${topic}`);

  const draft = await completeJson(
    provider,
    {
      key: 'research/investigate',
      prompt: renderPrompt('research/investigate.md', { topic, minClaims, maxClaims }),
      humanHint: `Investiga "${topic}" y devuelve afirmaciones con su fuente primaria.`,
    },
    DraftSchema,
  );

  const rawClaims: Claim[] = draft.claims.map((claim) => ({
    id: claim.id,
    statement: claim.statement,
    supportingQuote: claim.supportingQuote,
    source: claim.source
      ? {
          url: claim.source.url,
          title: claim.source.title,
          tier: claim.source.tier,
          publisher: claim.source.publisher,
          retrievedAt: claim.source.retrievedAt ?? new Date().toISOString(),
        }
      : undefined,
    verified: false,
  }));

  const checked = await verifyClaims(provider, config, rawClaims);

  const sheet: FactSheet = {
    videoId,
    topic: draft.topic || topic,
    claims: checked,
    openQuestions: draft.openQuestions ?? [],
    generatedAt: new Date().toISOString(),
  };

  // Contrato final: aqui si se valida estricto. Lo que salga de esta etapa
  // ya es dato del sistema, no salida cruda de un modelo.
  FactSheetSchema.parse(sheet);
  z.array(ClaimSchema).parse(sheet.claims);

  new ClaimRepository(openDatabase()).replaceForVideo(videoId, sheet.claims);
  const artifactPath = writeArtifact(videoId, 'research', sheet);

  const verified = verifiedClaims(sheet).length;
  const rejected = rejectedClaims(sheet).length;

  /**
   * El umbral es un freno, no una sugerencia. Un tema que no reune suficientes
   * afirmaciones verificadas no da para un video honesto de diez minutos: da
   * para relleno. Mejor pararlo aqui que descubrirlo en el guion.
   */
  if (verified < config.MIN_VERIFIED_CLAIMS) {
    throw new OsakiError(
      `Solo ${verified} afirmaciones verificadas (el minimo es ${config.MIN_VERIFIED_CLAIMS}).\n` +
        `  Rechazadas: ${rejected}. Revisa el detalle en:\n  ${artifactPath}\n\n` +
        `  Opciones: elegir otro tema, o aportar fuentes a mano en ese archivo y\n` +
        `  reejecutar la etapa siguiente.`,
      { stage: 'research' },
    );
  }

  return { sheet, verified, rejected, artifactPath };
}

/** Lee el documento de hechos ya generado. Lo usan las etapas siguientes. */
export function readFactSheet(videoId: string): FactSheet {
  return readArtifact(videoId, 'research', FactSheetSchema);
}

/**
 * Lo que ve el generador de guion.
 *
 * Con la politica por defecto (`exclude`), las afirmaciones sin fuente
 * verificable NO llegan aqui. No se marcan: no existen para el guion. El
 * reporte de descartes lo lee un humano por separado.
 */
export function claimsForScript(sheet: FactSheet): Claim[] {
  return loadConfig().UNVERIFIED_CLAIMS_POLICY === 'flag' ? sheet.claims : verifiedClaims(sheet);
}
