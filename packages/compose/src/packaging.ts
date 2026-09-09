import { z } from 'zod';
import {
  createLogger,
  loadConfig,
  readArtifact,
  verifiedClaims,
  writeArtifact,
  type FactSheet,
  type Script,
} from '@osaki/core';
import { completeJson, createLlmProvider, renderPrompt } from '@osaki/llm';
import type { AudioArtifact } from './audio.js';

const log = createLogger('packaging');

export const PackagingArtifactSchema = z.object({
  videoId: z.string(),
  titles: z.array(z.object({ strategy: z.string(), text: z.string(), reasoning: z.string() })),
  description: z.string(),
  chapters: z.array(z.object({ time: z.string(), title: z.string() })),
  tags: z.array(z.string()),
  /** Props de las tres miniaturas, para renderizarlas con Remotion. */
  thumbnails: z.array(z.object({ headline: z.string(), kicker: z.string().optional() })),
  generatedAt: z.string().datetime(),
});

export type PackagingArtifact = z.infer<typeof PackagingArtifactSchema>;

const TitlesSchema = z.object({
  titles: z.array(z.object({ strategy: z.string(), text: z.string(), reasoning: z.string() })).min(3),
});

const DescriptionSchema = z.object({
  summary: z.string(),
  chapters: z.array(z.object({ time: z.string(), title: z.string() })).min(1),
  tags: z.array(z.string()).min(4),
});

/** Segundos a `m:ss`, el formato que YouTube reconoce como capitulo. */
function timecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Etapa 8: empaque.
 *
 * Titulos, descripcion con capitulos y fuentes, tags y miniaturas.
 *
 * Las marcas de tiempo de los capitulos NO se las inventa el modelo: se
 * calculan desde el timing real del audio y se le pasan ya hechas. Un modelo
 * estimando timecodes produce capitulos desplazados, y un capitulo desplazado
 * es peor que no tener capitulos.
 */
export async function runPackagingStage(
  videoId: string,
  script: Script,
  sheet: FactSheet,
  audio: AudioArtifact,
  angle: { hook: string; thesis: string; beats: string[] },
): Promise<PackagingArtifact> {
  const provider = createLlmProvider(loadConfig());

  const titles = await completeJson(
    provider,
    {
      key: 'packaging/titles',
      prompt: renderPrompt('packaging/titles.md', {
        title: script.title,
        thesis: angle.thesis,
        hook: angle.hook,
        beats: angle.beats.map((beat, index) => `${index + 1}. ${beat}`).join('\n'),
      }),
      tier: 'utility',
      humanHint: `Cinco titulos para "${script.title}".`,
    },
    TitlesSchema,
  );

  // Marcas de tiempo reales, calculadas desde el audio.
  const segmentTimes = new Map<number, string>();
  for (const timing of audio.timings) {
    segmentTimes.set(timing.segmentIndex, timecode(timing.startFrame / audio.fps));
  }

  const chapterInput = script.segments
    .map(
      (segment) =>
        `${segmentTimes.get(segment.index) ?? '0:00'}  [${segment.index}] ${segment.narration.slice(0, 110)}`,
    )
    .join('\n');

  const sources = verifiedClaims(sheet)
    .flatMap((claim) => (claim.source ? [claim.source] : []))
    .filter(
      (source, index, all) => all.findIndex((other) => other.url === source.url) === index,
    );

  const description = await completeJson(
    provider,
    {
      key: 'packaging/description',
      prompt: renderPrompt('packaging/description.md', {
        title: script.title,
        thesis: angle.thesis,
        chapters: chapterInput,
        sources: sources.map((source) => `- ${source.title} — ${source.url}`).join('\n'),
      }),
      tier: 'utility',
      humanHint: 'Escribe la descripcion de YouTube con capitulos y tags.',
    },
    DescriptionSchema,
  );

  /**
   * La descripcion se ensambla aqui, no la escribe el modelo entera.
   *
   * Las fuentes son el activo del canal: se copian literalmente desde las
   * afirmaciones verificadas. Dejar que el modelo las reescriba abriria la
   * puerta a que cambie una URL, y una fuente mal citada vale menos que
   * ninguna.
   */
  const body = [
    description.summary,
    '',
    'CAPITULOS',
    ...description.chapters.map((chapter) => `${chapter.time} ${chapter.title}`),
    '',
    'FUENTES',
    ...sources.map((source) => `${source.title}\n${source.url}`),
  ].join('\n');

  const artifact: PackagingArtifact = {
    videoId,
    titles: titles.titles,
    description: body,
    chapters: description.chapters,
    tags: description.tags,
    // Tres miniaturas: los tres titulos mas distintos entre si.
    thumbnails: titles.titles
      .filter((title) => ['contradiccion', 'pregunta', 'recomendado'].includes(title.strategy))
      .slice(0, 3)
      .map((title) => ({ headline: title.text, kicker: 'Ingenieria explicada' })),
    generatedAt: new Date().toISOString(),
  };

  writeArtifact(videoId, 'packaging', artifact);
  log.info(`empaque: ${artifact.titles.length} titulos, ${artifact.chapters.length} capitulos`);

  return artifact;
}

export function readPackaging(videoId: string): PackagingArtifact {
  return readArtifact(videoId, 'packaging', PackagingArtifactSchema);
}
