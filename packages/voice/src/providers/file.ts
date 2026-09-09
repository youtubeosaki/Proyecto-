import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger, loadConfig } from '@osaki/core';
import {
  segmentFileName,
  type VoiceProvider,
  type VoiceSegmentRequest,
  type VoiceSegmentResult,
} from '../provider.js';
import { wavDurationSeconds } from '../wav.js';

const log = createLogger('voice:file');

/**
 * Tu propia grabacion.
 *
 * No genera nada: busca `data/audio/<videoId>/seg-NNN.wav` y mide su
 * duracion. Si falta, devuelve null y la etapa te dice exactamente que
 * grabar, con el texto de cada segmento.
 *
 * Es el proveedor por defecto porque es gratis, y porque una voz humana real
 * es justo el tipo de aporte que separa un canal de una granja de contenido.
 */
export class FileVoiceProvider implements VoiceProvider {
  readonly name = 'file' as const;

  pathFor(videoId: string, index: number): string {
    const dir = join(loadConfig().paths.audio, videoId);
    mkdirSync(dir, { recursive: true });
    return join(dir, segmentFileName(index));
  }

  async segment(request: VoiceSegmentRequest): Promise<VoiceSegmentResult | null> {
    const audioPath = this.pathFor(request.videoId, request.index);
    if (!existsSync(audioPath)) return null;

    const durationSeconds = wavDurationSeconds(audioPath);
    log.debug(`segmento ${request.index}: ${durationSeconds.toFixed(2)}s`);

    return { index: request.index, audioPath, durationSeconds };
  }
}
