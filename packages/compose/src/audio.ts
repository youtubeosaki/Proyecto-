import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  HumanInputRequiredError,
  SceneTimingSchema,
  createLogger,
  loadConfig,
  readArtifact,
  writeArtifact,
  type Script,
  type SceneTiming,
  type Storyboard,
} from '@osaki/core';
import { createVoiceProvider, type VoiceSegmentResult } from '@osaki/voice';

const log = createLogger('audio');

export const AudioArtifactSchema = z.object({
  videoId: z.string(),
  provider: z.string(),
  fps: z.number().int().positive(),
  segments: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      audioPath: z.string(),
      durationSeconds: z.number().positive(),
    }),
  ),
  timings: z.array(SceneTimingSchema),
  totalSeconds: z.number().positive(),
  generatedAt: z.string().datetime(),
});

export type AudioArtifact = z.infer<typeof AudioArtifactSchema>;

/**
 * Aire entre segmentos, en segundos.
 *
 * Sin esto el video suena como una lista leida de corrido. Una pausa corta
 * entre planos es lo que da tiempo a leer el diagrama que acaba de aparecer.
 */
const GAP_SECONDS = 0.35;

/**
 * Etapa 6: audio y timing.
 *
 * Aqui es donde la duracion REAL del audio se convierte en el timing de las
 * escenas. Es el unico sitio del pipeline donde eso pasa: antes de esta
 * etapa todas las duraciones son estimaciones, y despues de ella ninguna lo
 * es.
 */
export async function runAudioStage(
  videoId: string,
  script: Script,
  storyboard: Storyboard,
): Promise<AudioArtifact> {
  const config = loadConfig();
  const voice = createVoiceProvider(config);
  const fps = storyboard.fps;

  const results: VoiceSegmentResult[] = [];
  const missing: { index: number; text: string; path: string }[] = [];

  for (const segment of script.segments) {
    const result = await voice.segment({
      videoId,
      index: segment.index,
      text: segment.narration,
    });

    if (result) results.push(result);
    else
      missing.push({
        index: segment.index,
        text: segment.narration,
        path: voice.pathFor(videoId, segment.index),
      });
  }

  /**
   * Faltan grabaciones. No es un fallo: es el proveedor `file` esperando a
   * que grabes. Se deja un guion de locucion en disco con el texto exacto de
   * cada segmento que falta, para que puedas grabar sin volver a la terminal.
   */
  if (missing.length > 0) {
    const scriptPath = join(config.paths.audio, videoId, 'POR-GRABAR.md');
    writeFileSync(
      scriptPath,
      [
        `# Segmentos por grabar — ${script.title}`,
        '',
        'Graba cada bloque en su propio archivo WAV, con el nombre indicado.',
        'Cuando esten todos, vuelve a ejecutar la etapa de audio.',
        '',
        ...missing.flatMap((entry) => [
          `## ${entry.index}  →  ${entry.path.split(/[/\\]/).pop()}`,
          '',
          entry.text,
          '',
        ]),
      ].join('\n'),
      'utf8',
    );

    throw new HumanInputRequiredError(
      `Faltan ${missing.length} de ${script.segments.length} grabaciones.`,
      [
        `Guion de locucion escrito en:`,
        `  ${scriptPath}`,
        '',
        'Graba cada segmento como WAV con el nombre que indica el archivo y',
        'vuelve a ejecutar la misma etapa. Los que ya existan no se repiten.',
        '',
        'Para una pista de referencia sin grabar nada, pon VOICE_PROVIDER=piper.',
      ].join('\n'),
      'audio',
    );
  }

  /**
   * Timing. Cada escena dura exactamente lo que dura su audio, mas el aire.
   *
   * Se redondea a frames enteros y se acumula el resultado REDONDEADO, no el
   * valor exacto: si se acumulara el exacto y se redondeara al final, los
   * errores se irian sumando y el audio acabaria desplazado respecto al
   * video en los ultimos segmentos.
   */
  const timings: SceneTiming[] = [];
  let cursor = 0;

  for (const result of results.sort((a, b) => a.index - b.index)) {
    const durationInFrames = Math.max(1, Math.round((result.durationSeconds + GAP_SECONDS) * fps));
    timings.push({
      segmentIndex: result.index,
      startFrame: cursor,
      durationInFrames,
      audioSeconds: result.durationSeconds,
    });
    cursor += durationInFrames;
  }

  const artifact: AudioArtifact = {
    videoId,
    provider: voice.name,
    fps,
    segments: results.map((result) => ({
      index: result.index,
      audioPath: result.audioPath,
      durationSeconds: result.durationSeconds,
    })),
    timings,
    totalSeconds: cursor / fps,
    generatedAt: new Date().toISOString(),
  };

  writeArtifact(videoId, 'audio', artifact);

  // El storyboard se reescribe con el timing real: es lo que consume el render.
  const timed: Storyboard = {
    ...storyboard,
    scenes: storyboard.scenes.map((scene) => ({
      ...scene,
      timing: timings.find((timing) => timing.segmentIndex === scene.segmentIndex),
    })),
  };
  writeArtifact(videoId, 'storyboard', timed);

  log.info(
    `audio de ${results.length} segmentos, ${artifact.totalSeconds.toFixed(1)}s totales (${voice.name})`,
  );

  return artifact;
}

export function readAudio(videoId: string): AudioArtifact {
  return readArtifact(videoId, 'audio', AudioArtifactSchema);
}
