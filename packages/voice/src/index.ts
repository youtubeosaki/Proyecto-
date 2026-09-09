import { OsakiError, loadConfig, type Config } from '@osaki/core';
import type { VoiceProvider } from './provider.js';
import { FileVoiceProvider } from './providers/file.js';
import { PiperVoiceProvider } from './providers/piper.js';

export * from './provider.js';
export * from './wav.js';
export { FileVoiceProvider, PiperVoiceProvider };

/** Construye el proveedor que dice `VOICE_PROVIDER`. Unico sitio que lo decide. */
export function createVoiceProvider(config: Config = loadConfig()): VoiceProvider {
  switch (config.VOICE_PROVIDER) {
    case 'file':
      return new FileVoiceProvider();
    case 'piper':
      return new PiperVoiceProvider();
    case 'elevenlabs':
      // Deliberadamente sin implementar: hasta ahora no ha hecho falta pagar
      // por voz. La interfaz ya esta, asi que añadirlo es escribir esta clase.
      throw new OsakiError(
        'El proveedor de voz "elevenlabs" todavia no esta implementado.\n' +
          '  Usa VOICE_PROVIDER=file (tu grabacion) o piper (TTS local gratuito).',
      );
  }
}
