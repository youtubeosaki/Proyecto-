#!/usr/bin/env node
/**
 * Genera narracion PROVISIONAL muda, un WAV por segmento, con la duracion
 * estimada a partir del numero de palabras.
 *
 * Para que sirve: ver el montaje completo con sus tiempos aproximados antes
 * de grabar nada. Descubrir que una escena se queda corta cuesta mucho menos
 * aqui que despues de haber grabado doce tomas.
 *
 * No sustituye a la narracion real. En cuanto grabes (o generes con Piper) un
 * segmento, borra su WAV provisional y vuelve a ejecutar la etapa de audio:
 * el timing se recalcula con la duracion real.
 *
 * Uso:  node tools/make-scratch-narration.mjs <videoId>
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SAMPLE_RATE = 22050;
const WORDS_PER_MINUTE = 145;
/** Aire al final de cada toma, como en una grabacion real. */
const TAIL_SECONDS = 0.4;

const videoId = process.argv[2];
if (!videoId) {
  console.error('Uso: node tools/make-scratch-narration.mjs <videoId>');
  process.exit(1);
}

const root = resolve(process.cwd());
const scriptPath = join(root, 'data', 'videos', videoId, 'script.json');
const outputDir = join(root, 'data', 'audio', videoId);

const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
mkdirSync(outputDir, { recursive: true });

/** WAV mono de 16 bits lleno de silencio. */
function silentWav(seconds) {
  const samples = Math.max(1, Math.round(seconds * SAMPLE_RATE));
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  return buffer;
}

let total = 0;

for (const segment of script.segments) {
  const words = segment.narration.split(/\s+/).filter(Boolean).length;
  const seconds = (words / WORDS_PER_MINUTE) * 60 + TAIL_SECONDS;
  const name = `seg-${String(segment.index).padStart(3, '0')}.wav`;

  writeFileSync(join(outputDir, name), silentWav(seconds));
  total += seconds;

  console.log(`  ${name}  ${words.toString().padStart(3)} palabras  ${seconds.toFixed(1)}s`);
}

const minutes = Math.floor(total / 60);
console.log(`\nNarracion provisional: ${script.segments.length} segmentos, ${minutes}m ${Math.round(total % 60)}s`);
console.log(`En: ${outputDir}`);
console.log('\nEs MUDA y provisional. Sirve para revisar el montaje y los tiempos.');
console.log('Al grabar un segmento, borra su WAV y reejecuta la etapa de audio.');
