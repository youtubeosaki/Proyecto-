#!/usr/bin/env node
/**
 * Sintetiza la cama sonora ambiental del canal y la escribe como WAV.
 *
 * Por que generarla en vez de descargarla: la musica con licencia es la vía
 * mas rapida a un reclamo de Content ID, y un reclamo en un canal nuevo es
 * caro de deshacer. Esto es audio original generado por un algoritmo que esta
 * en el repositorio; su procedencia es auditable.
 *
 * La pieza es deliberadamente aburrida. Una cama sonora para contenido tecnico
 * tiene que sostener la narracion sin pedir atencion: sin percusion, sin
 * melodia identificable, sin nada que el oido quiera seguir.
 *
 * Uso:  node tools/make-ambient-bed.mjs [segundos] [salida.wav]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;

const seconds = Number(process.argv[2] ?? 60);
const outputPath = process.argv[3] ?? 'video/public/ambient-bed.wav';

/* -------------------------------------------------------------------------
 * Material armonico
 *
 * La menor. Tonica y quinta como drone, y una triada abierta encima. Las
 * frecuencias estan destempladas unos pocos cents entre si: dos osciladores
 * exactamente afinados suenan a sintetizador barato; destemplados suenan a
 * cuerda pulsada.
 * ---------------------------------------------------------------------- */

const cents = (hz, c) => hz * 2 ** (c / 1200);

const VOICES = [
  // Drone grave. Es el que da el peso.
  { hz: 55.00, gain: 0.30, pan: 0.5, lfoPeriod: 23, lfoDepth: 0.15 },
  { hz: cents(55.0, 4), gain: 0.22, pan: 0.5, lfoPeriod: 31, lfoDepth: 0.20 },
  { hz: 82.41, gain: 0.16, pan: 0.42, lfoPeriod: 19, lfoDepth: 0.25 },

  // Pad medio: la triada abierta, entrando y saliendo muy despacio.
  { hz: 220.00, gain: 0.055, pan: 0.30, lfoPeriod: 17, lfoDepth: 0.75 },
  { hz: cents(261.63, -6), gain: 0.045, pan: 0.70, lfoPeriod: 21, lfoDepth: 0.80 },
  { hz: 329.63, gain: 0.038, pan: 0.38, lfoPeriod: 27, lfoDepth: 0.85 },
  { hz: cents(440.0, 5), gain: 0.022, pan: 0.66, lfoPeriod: 33, lfoDepth: 0.90 },

  // Brillo lejano. Casi inaudible por separado; sin el, la mezcla suena tapada.
  { hz: 659.26, gain: 0.012, pan: 0.55, lfoPeriod: 41, lfoDepth: 0.95 },
];

/* -------------------------------------------------------------------------
 * Generacion
 * ---------------------------------------------------------------------- */

const totalSamples = Math.floor(seconds * SAMPLE_RATE);
const left = new Float64Array(totalSamples);
const right = new Float64Array(totalSamples);

// Ruido rosa aproximado (Voss-McCartney simplificado). Aporta el "aire" que
// hace que la cama no suene a tono de prueba.
let pinkRows = [0, 0, 0, 0, 0];
let pinkRunning = 0;
let pinkCounter = 0;

function pinkNoise() {
  pinkCounter++;
  for (let i = 0; i < pinkRows.length; i++) {
    if (pinkCounter % (1 << i) === 0) {
      pinkRunning -= pinkRows[i];
      pinkRows[i] = Math.random() * 2 - 1;
      pinkRunning += pinkRows[i];
    }
  }
  return pinkRunning / pinkRows.length;
}

// Filtro paso bajo de un polo. Deja el ruido como una brisa, no como estatica.
let noiseLpL = 0;
let noiseLpR = 0;
const NOISE_CUTOFF = 0.0025;

for (let n = 0; n < totalSamples; n++) {
  const t = n / SAMPLE_RATE;

  let sampleL = 0;
  let sampleR = 0;

  for (const voice of VOICES) {
    // Cada voz respira con su propio periodo. Que los periodos sean primos
    // entre si es lo que evita que la pieza se sienta en bucle.
    const lfo = Math.sin((t / voice.lfoPeriod) * Math.PI * 2);
    const envelope = 1 - voice.lfoDepth + voice.lfoDepth * (lfo * 0.5 + 0.5);

    // Vibrato muy leve: sin el, un seno sostenido suena sintetico.
    const vibrato = 1 + Math.sin(t * 0.37 * Math.PI * 2) * 0.0015;

    const value = Math.sin(t * voice.hz * vibrato * Math.PI * 2) * voice.gain * envelope;

    sampleL += value * (1 - voice.pan);
    sampleR += value * voice.pan;
  }

  // Aire filtrado, con su propia oscilacion muy lenta.
  const airEnvelope = 0.5 + 0.5 * Math.sin((t / 37) * Math.PI * 2);
  noiseLpL += (pinkNoise() - noiseLpL) * NOISE_CUTOFF;
  noiseLpR += (pinkNoise() - noiseLpR) * NOISE_CUTOFF;
  sampleL += noiseLpL * 9 * airEnvelope;
  sampleR += noiseLpR * 9 * airEnvelope;

  left[n] = sampleL;
  right[n] = sampleR;
}

/* -------------------------------------------------------------------------
 * Acabado: fundidos y normalizacion
 * ---------------------------------------------------------------------- */

const FADE = Math.floor(2.5 * SAMPLE_RATE);

for (let n = 0; n < totalSamples; n++) {
  let gain = 1;
  if (n < FADE) gain = n / FADE;
  else if (n > totalSamples - FADE) gain = (totalSamples - n) / FADE;
  // Curva cuadratica: un fundido lineal se oye "apagarse", uno cuadratico
  // se oye desaparecer.
  gain = gain * gain;
  left[n] *= gain;
  right[n] *= gain;
}

let peak = 0;
for (let n = 0; n < totalSamples; n++) {
  peak = Math.max(peak, Math.abs(left[n]), Math.abs(right[n]));
}

// -14 dBFS de pico. Deja techo de sobra para que la narracion mande.
const target = 10 ** (-14 / 20);
const normalize = peak > 0 ? target / peak : 1;

/* -------------------------------------------------------------------------
 * WAV PCM 16 bits
 * ---------------------------------------------------------------------- */

const dataBytes = totalSamples * CHANNELS * 2;
const buffer = Buffer.alloc(44 + dataBytes);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);                                 // PCM
buffer.writeUInt16LE(CHANNELS, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);        // byte rate
buffer.writeUInt16LE(CHANNELS * 2, 32);                      // block align
buffer.writeUInt16LE(16, 34);                                // bits per sample
buffer.write('data', 36);
buffer.writeUInt32LE(dataBytes, 40);

const clamp = (value) => Math.max(-32768, Math.min(32767, Math.round(value * normalize * 32767)));

let offset = 44;
for (let n = 0; n < totalSamples; n++) {
  buffer.writeInt16LE(clamp(left[n]), offset);
  buffer.writeInt16LE(clamp(right[n]), offset + 2);
  offset += 4;
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, buffer);

console.log(`Cama sonora escrita: ${outputPath}`);
console.log(`  ${seconds}s, ${SAMPLE_RATE} Hz estereo, pico normalizado a -14 dBFS`);
