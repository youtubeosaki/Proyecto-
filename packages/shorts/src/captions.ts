/**
 * SUBTITULOS QUEMADOS
 *
 * Los Shorts se ven sin sonido la mayor parte del tiempo, asi que el
 * subtitulo no es accesibilidad: es el contenido.
 *
 * LIMITACION QUE HAY QUE CONOCER: no tenemos marcas de tiempo por palabra.
 * El audio se mide entero por segmento, no palabra a palabra. Asi que el
 * reparto es PROPORCIONAL A LOS CARACTERES, que es una aproximacion decente
 * en narracion continua y se desvia cuando hay pausas largas o enfasis.
 *
 * Si algun dia hace falta precision real, la via es whisper.cpp con marcas
 * por palabra sobre el WAV ya grabado, y este modulo pasaria a consumirlas.
 * Mientras tanto, prefiero una aproximacion documentada a una precision
 * fingida.
 */

export interface Caption {
  text: string;
  startFrame: number;
  durationInFrames: number;
}

/** Caracteres por linea. Mas de esto y en vertical se parte fatal. */
const MAX_CHARS = 34;

/**
 * Parte la narracion en lineas cortas respetando los limites de frase.
 *
 * Cortar por numero de palabras produce lineas que empiezan por "de" o "que";
 * cortar por puntuacion cuando se puede hace que cada linea sea una unidad
 * que se lee de un vistazo.
 */
export function splitIntoLines(text: string, maxChars = MAX_CHARS): string[] {
  const lines: string[] = [];
  let current = '';

  // Se trocea primero por puntuacion y luego por palabras.
  const chunks = text.split(/(?<=[.,:;?!])\s+/);

  for (const chunk of chunks) {
    for (const word of chunk.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;

      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }

    /**
     * Tras puntuacion FUERTE se corta siempre; tras una coma, solo si la
     * linea ya tiene cuerpo.
     *
     * Sin la regla fuerte, una frase que acaba en dos puntos se pega a la
     * siguiente y el subtitulo empieza a media oracion ("interesante: si el
     * original si"), que es exactamente lo que hace ilegible un Short.
     */
    const endsStrong = /[.:;?!]$/.test(chunk.trim());
    if (current && (endsStrong || current.length > maxChars * 0.6)) {
      lines.push(current);
      current = '';
    }
  }

  if (current) lines.push(current);

  return mergeOrphans(lines, maxChars);
}

/**
 * Une los fragmentos huerfanos con la linea anterior.
 *
 * Cortar siempre tras puntuacion fuerte evita que un subtitulo empiece a
 * media oracion, pero produce el problema opuesto: "interesante:" solo en
 * pantalla durante medio segundo. Un fragmento de dos palabras no da tiempo
 * ni a leerlo y ademas rompe el ritmo.
 *
 * Se permite superar `maxChars` hasta un 25% al unir, porque una linea algo
 * larga se lee mejor que una linea suelta de dos palabras.
 */
function mergeOrphans(lines: readonly string[], maxChars: number): string[] {
  const hardMax = Math.round(maxChars * 1.25);
  const merged: string[] = [];

  for (const line of lines) {
    const previous = merged[merged.length - 1];
    const isOrphan = line.length < maxChars * 0.45;

    if (previous && isOrphan && previous.length + line.length + 1 <= hardMax) {
      merged[merged.length - 1] = `${previous} ${line}`;
    } else {
      merged.push(line);
    }
  }

  return merged;
}

/**
 * Reparte las lineas a lo largo de la duracion del segmento.
 *
 * Proporcional a los caracteres y no a partes iguales: una linea de treinta
 * caracteres tarda mas en decirse que una de diez, y a partes iguales la
 * larga desaparece antes de poder leerla.
 */
export function buildCaptions(
  text: string,
  durationInFrames: number,
  maxChars = MAX_CHARS,
): Caption[] {
  const lines = splitIntoLines(text, maxChars);
  if (lines.length === 0) return [];

  const totalChars = lines.reduce((sum, line) => sum + line.length, 0);

  const captions: Caption[] = [];
  let cursor = 0;

  lines.forEach((line, index) => {
    const share = line.length / totalChars;
    // La ultima absorbe el redondeo: sin eso quedan frames sin subtitulo al
    // final, que es justo donde esta el remate.
    const frames =
      index === lines.length - 1
        ? durationInFrames - cursor
        : Math.max(1, Math.round(durationInFrames * share));

    captions.push({ text: line, startFrame: cursor, durationInFrames: frames });
    cursor += frames;
  });

  return captions;
}
