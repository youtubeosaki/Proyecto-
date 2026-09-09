import { z } from 'zod';
import {
  createLogger,
  loadConfig,
  makeId,
  readArtifact,
  writeArtifact,
  type Script,
  type Storyboard,
} from '@osaki/core';
import { openDatabase } from '@osaki/db';
import { completeJson, createLlmProvider, renderPrompt } from '@osaki/llm';
import { buildCaptions, type Caption } from './captions.js';

export * from './captions.js';

const log = createLogger('shorts');

const SelectionSchema = z.object({
  shorts: z
    .array(
      z.object({
        segmentIndex: z.number().int().nonnegative(),
        title: z.string(),
        hookReason: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(4),
});

export const ShortsArtifactSchema = z.object({
  videoId: z.string(),
  shorts: z.array(
    z.object({
      id: z.string(),
      segmentIndex: z.number().int().nonnegative(),
      title: z.string(),
      hookReason: z.string(),
      confidence: z.number(),
      /** Composicion vertical lista para renderizar. */
      scene: z.object({ kind: z.string(), props: z.record(z.unknown()) }),
      durationInFrames: z.number().int().positive(),
      audioPath: z.string().optional(),
      captions: z.array(
        z.object({
          text: z.string(),
          startFrame: z.number().int().nonnegative(),
          durationInFrames: z.number().int().positive(),
        }),
      ),
    }),
  ),
  generatedAt: z.string().datetime(),
});

export type ShortsArtifact = z.infer<typeof ShortsArtifactSchema>;

/** Por debajo de esto no se genera: un Short flojo cuesta mas que no publicarlo. */
const MIN_CONFIDENCE = 0.55;

/**
 * Etapa 10: Shorts derivados.
 *
 * Los cortes REUTILIZAN las escenas del video largo, no se rediseñan. Los
 * componentes usan coordenadas en porcentaje precisamente para esto: el mismo
 * diagrama funciona en 16:9 y en 9:16 sin tocar nada.
 */
export async function runShortsStage(
  videoId: string,
  script: Script,
  storyboard: Storyboard,
  audio: { fps: number; segments: { index: number; audioPath: string }[] },
): Promise<ShortsArtifact> {
  const provider = createLlmProvider(loadConfig());

  const segments = script.segments
    .map(
      (segment) =>
        `[${segment.index}] ${segment.narration}\n     escena: ${segment.scene?.kind ?? '(ninguna)'}`,
    )
    .join('\n\n');

  const selection = await completeJson(
    provider,
    {
      key: 'packaging/shorts',
      prompt: renderPrompt('packaging/shorts.md', { segments }),
      tier: 'utility',
      humanHint: 'Elige que segmentos del video se sostienen solos como Shorts.',
    },
    SelectionSchema,
  );

  const byIndex = new Map(storyboard.scenes.map((scene) => [scene.segmentIndex, scene]));
  const audioByIndex = new Map(audio.segments.map((entry) => [entry.index, entry.audioPath]));

  const chosen = selection.shorts
    .filter((candidate) => {
      if (candidate.confidence < MIN_CONFIDENCE) {
        log.info(
          `descartado el segmento ${candidate.segmentIndex}: confianza ${candidate.confidence.toFixed(2)}`,
        );
        return false;
      }
      if (!byIndex.has(candidate.segmentIndex)) {
        log.warn(`el segmento ${candidate.segmentIndex} no tiene escena en el storyboard`);
        return false;
      }
      return true;
    })
    .slice(0, 3);

  const shorts = chosen.map((candidate) => {
    const scene = byIndex.get(candidate.segmentIndex)!;
    const segment = script.segments.find((s) => s.index === candidate.segmentIndex)!;
    const durationInFrames = scene.timing?.durationInFrames ?? audio.fps * 20;

    const captions: Caption[] = buildCaptions(segment.narration, durationInFrames);

    return {
      id: makeId('short'),
      segmentIndex: candidate.segmentIndex,
      title: candidate.title,
      hookReason: candidate.hookReason,
      confidence: candidate.confidence,
      scene: { kind: scene.kind, props: scene.props },
      durationInFrames,
      audioPath: audioByIndex.get(candidate.segmentIndex),
      captions,
    };
  });

  const artifact: ShortsArtifact = {
    videoId,
    shorts,
    generatedAt: new Date().toISOString(),
  };

  // Registro en la base para poder rastrear que Short salio de que video.
  const db = openDatabase();
  const insert = db.prepare(
    `INSERT INTO shorts (id, video_id, segment_index, title, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare('DELETE FROM shorts WHERE video_id = ?').run(videoId);
    for (const short of shorts) {
      insert.run(short.id, videoId, short.segmentIndex, short.title, new Date().toISOString());
    }
  })();

  writeArtifact(videoId, 'shorts', artifact);
  log.info(`${shorts.length} Shorts de ${selection.shorts.length} candidatos`);

  return artifact;
}

export function readShorts(videoId: string): ShortsArtifact {
  return readArtifact(videoId, 'shorts', ShortsArtifactSchema);
}
