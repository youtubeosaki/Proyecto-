import { openSync, readSync, closeSync } from 'node:fs';
import { OsakiError } from '@osaki/core';

/**
 * Duracion de un WAV leyendo su cabecera.
 *
 * Sin dependencias y sin lanzar ffmpeg: son 44 bytes y el calculo es una
 * division. Meter un proceso externo para esto multiplicaria por cien el
 * coste de una operacion que hacemos una vez por segmento.
 *
 * Se recorren los chunks en vez de asumir que `data` esta en el offset 36:
 * los editores de audio insertan chunks de metadatos (LIST, fact) antes, y
 * dar por hecho el offset produce duraciones absurdas en archivos reales.
 */
export function wavDurationSeconds(path: string): number {
  const fd = openSync(path, 'r');

  try {
    const header = Buffer.alloc(12);
    if (readSync(fd, header, 0, 12, 0) < 12) {
      throw new OsakiError(`${path} es demasiado corto para ser un WAV.`);
    }

    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      throw new OsakiError(`${path} no es un WAV (falta la cabecera RIFF/WAVE).`);
    }

    let offset = 12;
    let byteRate = 0;

    // Los chunks van en cualquier orden; hay que recorrerlos hasta encontrar
    // `fmt ` y `data`.
    for (let guard = 0; guard < 64; guard++) {
      const chunk = Buffer.alloc(8);
      if (readSync(fd, chunk, 0, 8, offset) < 8) break;

      const id = chunk.toString('ascii', 0, 4);
      const size = chunk.readUInt32LE(4);

      if (id === 'fmt ') {
        const fmt = Buffer.alloc(16);
        readSync(fd, fmt, 0, 16, offset + 8);
        byteRate = fmt.readUInt32LE(8);
      } else if (id === 'data') {
        if (byteRate === 0) {
          throw new OsakiError(`${path} tiene el chunk data antes que fmt: no se puede leer.`);
        }
        return size / byteRate;
      }

      // Los chunks se alinean a bytes pares.
      offset += 8 + size + (size % 2);
    }

    throw new OsakiError(`${path} no contiene un chunk de datos legible.`);
  } finally {
    closeSync(fd);
  }
}
