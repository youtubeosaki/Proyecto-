import { z } from 'zod';
import {
  MissingSceneComponentError,
  OsakiError,
  ScriptSchema,
  createLogger,
  describeSceneCatalog,
  loadConfig,
  readArtifact,
  writeArtifact,
  type Angle,
  type FactSheet,
  type Script,
  type ScriptSegment,
} from '@osaki/core';
import { completeJson, createLlmProvider, renderPrompt } from '@osaki/llm';
import { claimsForScript } from '@osaki/research';
import { parseSceneMarkers, stripSceneMarkers, unknownSceneKinds } from './sceneMarkers.js';

const log = createLogger('script:write');

const DraftSchema = z.object({
  title: z.string(),
  segments: z.array(
    z.object({
      narration: z.string(),
      /** Marca cruda tal como la escribio el modelo, si la puso. */
      scene: z.string().optional(),
      claimIds: z.array(z.string()).optional(),
    }),
  ),
});

/** Palabras por minuto de una narracion tecnica pausada. */
const WORDS_PER_MINUTE = 145;

export function estimateMinutes(words: number): number {
  return Number((words / WORDS_PER_MINUTE).toFixed(1));
}

/**
 * Etapa 4: el guion.
 *
 * Recibe SOLO las afirmaciones verificadas (con la politica por defecto) y el
 * catalogo de escenas. Esas dos restricciones son las que hacen que el guion
 * sea escribible: no puede afirmar lo que no se sostiene, y no puede pedir
 * escenas que no existen.
 */
export async function runScriptStage(
  videoId: string,
  sheet: FactSheet,
  angle: Angle,
  options: { targetMinutes?: number } = {},
): Promise<Script> {
  const config = loadConfig();
  const provider = createLlmProvider(config);
  const { targetMinutes = 10 } = options;

  const claims = claimsForScript(sheet);
  const claimList = claims
    .map(
      (claim) =>
        `- [${claim.id}] ${claim.statement}` +
        (claim.source ? `\n    fuente: ${claim.source.title} (${claim.source.tier})` : ''),
    )
    .join('\n');

  const draft = await completeJson(
    provider,
    {
      key: 'script/write',
      prompt: renderPrompt('script/write.md', {
        topic: sheet.topic,
        hook: angle.hook,
        title: angle.title,
        thesis: angle.thesis,
        beats: angle.beats.map((beat, index) => `${index + 1}. ${beat}`).join('\n'),
        claims: claimList,
        sceneCatalog: describeSceneCatalog(),
        targetMinutes,
        targetWords: Math.round(targetMinutes * WORDS_PER_MINUTE),
      }),
      humanHint: `Escribe el guion completo de "${angle.title}".`,
    },
    DraftSchema,
  );

  const validClaimIds = new Set(claims.map((claim) => claim.id));

  const segments: ScriptSegment[] = draft.segments.map((segment, index) => {
    const markerSource = segment.scene ?? segment.narration;
    const markers = parseSceneMarkers(markerSource);
    const marker = markers[0];

    return {
      index,
      narration: stripSceneMarkers(segment.narration),
      scene: marker ? { kind: marker.kind, raw: marker.raw, props: {} } : undefined,
      // Se descartan las referencias a afirmaciones que no existen. Un id
      // inventado en el guion rompe la trazabilidad hasta la fuente, que es
      // justo lo que este pipeline vende.
      claimIds: (segment.claimIds ?? []).filter((id) => validClaimIds.has(id)),
    };
  });

  /**
   * Comprobacion de escenas. Si el guion pide un componente que no existe,
   * la etapa FALLA y dice cual falta.
   *
   * Mapearlo al mas parecido produciria un video que se renderiza sin errores
   * y explica mal, que es el peor fallo posible: nadie lo revisa porque no
   * hay nada rojo.
   */
  const allMarkers = segments.flatMap((segment) =>
    segment.scene ? parseSceneMarkers(segment.scene.raw) : [],
  );
  const missing = unknownSceneKinds(allMarkers);
  if (missing.length > 0) {
    throw new MissingSceneComponentError(missing);
  }

  const words = segments.reduce(
    (total, segment) => total + segment.narration.split(/\s+/).filter(Boolean).length,
    0,
  );

  const script: Script = {
    videoId,
    title: draft.title || angle.title,
    angleId: angle.id,
    segments,
    estimatedWords: words,
    generatedAt: new Date().toISOString(),
  };

  ScriptSchema.parse(script);

  const minutes = estimateMinutes(words);
  log.info(`guion de ${words} palabras, ~${minutes} min, ${segments.length} segmentos`);

  if (minutes < targetMinutes * 0.6) {
    // Aviso, no error: un guion corto se alarga editandolo, no repitiendo la
    // etapa entera y pagando otra vez.
    log.warn(`el guion se queda en ~${minutes} min frente a los ${targetMinutes} pedidos`);
  }

  const withoutClaims = segments.filter(
    (segment) => segment.narration.length > 80 && segment.claimIds.length === 0,
  ).length;
  if (withoutClaims > segments.length / 2) {
    log.warn(
      `${withoutClaims} de ${segments.length} segmentos no citan ninguna afirmacion verificada`,
    );
  }

  writeArtifact(videoId, 'script', script);
  return script;
}

export function readScript(videoId: string): Script {
  return readArtifact(videoId, 'script', ScriptSchema);
}

/** Solo la narracion, sin marcas. Es lo que consume la etapa de audio. */
export function narrationText(script: Script): string {
  return script.segments.map((segment) => segment.narration).join('\n\n');
}

export function assertScriptReady(script: Script): void {
  if (script.segments.length === 0) {
    throw new OsakiError('El guion no tiene segmentos.', { stage: 'script' });
  }
}
