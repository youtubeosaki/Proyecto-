/**
 * INTERFAZ DE VOZ
 *
 * Una interfaz, varias implementaciones. El pipeline nunca sabe si detras hay
 * tu grabacion, un TTS local o uno de pago.
 *
 * Decision de diseño: la narracion se produce POR SEGMENTO, no como un unico
 * archivo largo. Tres razones:
 *
 *   1. La duracion de cada archivo ES el timing de su escena. Sin esto habria
 *      que alinear un audio largo contra el texto, que necesita reconocimiento
 *      de voz y falla justo en los terminos tecnicos del canal.
 *   2. Una retoma cuesta un segmento, no el video entero.
 *   3. Cambiar una frase del guion solo invalida su segmento.
 */

export interface VoiceSegmentRequest {
  videoId: string;
  index: number;
  /** Texto a narrar, ya sin marcas de escena. */
  text: string;
}

export interface VoiceSegmentResult {
  index: number;
  audioPath: string;
  durationSeconds: number;
}

export interface VoiceProvider {
  readonly name: 'file' | 'piper' | 'elevenlabs';

  /**
   * Produce (o localiza) el audio de un segmento.
   *
   * Devuelve `null` si el audio todavia no existe y el proveedor no puede
   * generarlo: es el caso de `file` esperando tu grabacion. No es un error,
   * es el pipeline esperando a un humano.
   */
  segment(request: VoiceSegmentRequest): Promise<VoiceSegmentResult | null>;

  /** Ruta donde vive (o vivira) el audio de un segmento. */
  pathFor(videoId: string, index: number): string;
}

/** Nombre estable de archivo por segmento: `seg-000.wav`, `seg-001.wav`... */
export function segmentFileName(index: number): string {
  return `seg-${String(index).padStart(3, '0')}.wav`;
}
