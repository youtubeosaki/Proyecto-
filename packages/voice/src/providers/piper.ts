import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ConfigError, ProviderError, createLogger, loadConfig } from '@osaki/core';
import {
  segmentFileName,
  type VoiceProvider,
  type VoiceSegmentRequest,
  type VoiceSegmentResult,
} from '../provider.js';
import { wavDurationSeconds } from '../wav.js';

const run = promisify(execFile);
const log = createLogger('voice:piper');

/**
 * Piper: TTS local, gratuito y sin conexion.
 *
 * Sirve para dos cosas: generar una pista de referencia con la que validar
 * el timing y el render sin tener que grabar nada, y quedarse como voz
 * definitiva si en algun momento decides no poner la tuya.
 *
 * Genera WAV directamente, que es lo que el resto del pipeline sabe medir.
 */
export class PiperVoiceProvider implements VoiceProvider {
  readonly name = 'piper' as const;

  pathFor(videoId: string, index: number): string {
    const dir = join(loadConfig().paths.audio, videoId);
    mkdirSync(dir, { recursive: true });
    return join(dir, segmentFileName(index));
  }

  async segment(request: VoiceSegmentRequest): Promise<VoiceSegmentResult | null> {
    const config = loadConfig();
    const audioPath = this.pathFor(request.videoId, request.index);

    // Ya generado: no se regenera. Si cambias el texto, borra el archivo.
    // Regenerar en cada ejecucion haria que el timing bailara entre renders.
    if (existsSync(audioPath)) {
      return { index: request.index, audioPath, durationSeconds: wavDurationSeconds(audioPath) };
    }

    if (!config.PIPER_VOICE_MODEL) {
      throw new ConfigError(
        'El proveedor de voz "piper" necesita PIPER_VOICE_MODEL en .env ' +
          '(ruta al archivo .onnx del modelo de voz).',
      );
    }

    try {
      await run(config.PIPER_BIN, ['--model', config.PIPER_VOICE_MODEL, '--output_file', audioPath], {
        // El texto entra por stdin, no como argumento: un guion largo supera
        // el limite de longitud de la linea de comandos en Windows.
        // @ts-expect-error `input` es valido en execFile aunque falte del tipo
        input: request.text,
      });
    } catch (error) {
      throw new ProviderError(
        `Piper fallo en el segmento ${request.index}. Comprueba PIPER_BIN y PIPER_VOICE_MODEL.`,
        { retryable: false, cause: error },
      );
    }

    const durationSeconds = wavDurationSeconds(audioPath);
    log.info(`segmento ${request.index} generado: ${durationSeconds.toFixed(2)}s`);

    return { index: request.index, audioPath, durationSeconds };
  }
}
