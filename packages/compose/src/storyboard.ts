import { z } from 'zod';
import {
  MissingSceneComponentError,
  StoryboardSchema,
  createLogger,
  describeSceneCatalog,
  isKnownSceneKind,
  loadConfig,
  readArtifact,
  writeArtifact,
  type Script,
  type Storyboard,
} from '@osaki/core';
import { completeJson, createLlmProvider, renderPrompt } from '@osaki/llm';

const log = createLogger('storyboard');

const MappingSchema = z.object({
  scenes: z.array(
    z.object({
      segmentIndex: z.number().int().nonnegative(),
      kind: z.string(),
      props: z.record(z.unknown()).optional(),
    }),
  ),
  missingComponents: z
    .array(
      z.object({
        requestedBy: z.string().optional(),
        segmentIndex: z.number().int().nonnegative().optional(),
        description: z.string(),
        suggestedName: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Etapa 5: storyboard.
 *
 * Convierte las marcas de escena del guion en props concretas de componentes
 * de Remotion.
 *
 * La etapa falla si el modelo pide un componente que no existe, y falla
 * tambien si intenta colarlo mapeandolo al mas parecido. La comprobacion se
 * hace contra el catalogo, no contra lo que el modelo diga haber usado.
 */
export async function runStoryboardStage(videoId: string, script: Script): Promise<Storyboard> {
  const provider = createLlmProvider(loadConfig());

  const scriptForPrompt = JSON.stringify(
    {
      title: script.title,
      segments: script.segments.map((segment) => ({
        index: segment.index,
        narration: segment.narration,
        scene: segment.scene?.raw ?? null,
      })),
    },
    null,
    2,
  );

  const mapping = await completeJson(
    provider,
    {
      key: 'storyboard/map-scenes',
      prompt: renderPrompt('storyboard/map-scenes.md', {
        sceneCatalog: describeSceneCatalog(),
        scriptJson: scriptForPrompt,
      }),
      humanHint: 'Traduce las marcas de escena del guion a props de componentes.',
    },
    MappingSchema,
  );

  // Lo que el modelo reconoce que no pudo mapear.
  const declaredMissing = mapping.missingComponents ?? [];
  // Y lo que intento colar de todas formas.
  const smuggled = mapping.scenes.filter((scene) => !isKnownSceneKind(scene.kind));

  if (declaredMissing.length > 0 || smuggled.length > 0) {
    const names = [
      ...declaredMissing.map((entry) => entry.suggestedName ?? entry.description),
      ...smuggled.map((scene) => scene.kind),
    ];
    log.error(`faltan componentes de escena: ${names.join(', ')}`);
    throw new MissingSceneComponentError(names);
  }

  const storyboard: Storyboard = {
    videoId,
    fps: 30,
    width: 1920,
    height: 1080,
    scenes: mapping.scenes
      .slice()
      .sort((a, b) => a.segmentIndex - b.segmentIndex)
      .map((scene) => ({
        segmentIndex: scene.segmentIndex,
        kind: scene.kind,
        props: scene.props ?? {},
      })),
    generatedAt: new Date().toISOString(),
  };

  StoryboardSchema.parse(storyboard);
  writeArtifact(videoId, 'storyboard', storyboard);

  log.info(`storyboard con ${storyboard.scenes.length} escenas`);
  return storyboard;
}

export function readStoryboard(videoId: string): Storyboard {
  return readArtifact(videoId, 'storyboard', StoryboardSchema);
}
