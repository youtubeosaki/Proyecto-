import { createHash } from 'node:crypto';
import type { Idea } from '@osaki/core';

/**
 * Clave de deduplicacion.
 *
 * El mismo tema llega desde varios sitios con el titulo ligeramente distinto:
 * el blog original, la sindicacion y el hilo de Hacker News. Normalizamos
 * agresivamente para que las tres colapsen en una.
 *
 * Se quitan las palabras vacias porque "How Discord stores billions of
 * messages" y "Discord: storing billions of messages" son el mismo tema, y
 * sin quitarlas producirian claves distintas.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or', 'is', 'are',
  'how', 'why', 'what', 'we', 'our', 'your', 'you', 'it', 'its', 'that', 'this', 'from',
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'o', 'en', 'con', 'por', 'para',
  'como', 'que', 'se', 'su', 'sus', 'lo',
]);

/**
 * Recorta terminaciones flexivas comunes.
 *
 * Sin esto, "How Discord STORES billions of messages" y "Discord: STORING
 * billions of messages" producen claves distintas y el mismo tema entra dos
 * veces. Es el caso normal, no el raro: el blog original y el hilo de Hacker
 * News casi nunca titulan igual.
 *
 * Deliberadamente crudo. Un lematizador de verdad seria una dependencia y un
 * modelo linguistico para resolver un problema que aqui es de titulares
 * cortos y vocabulario tecnico. El riesgo de recortar de mas es unir dos
 * temas distintos, y en este dominio eso casi no pasa.
 */
function stem(word: string): string {
  // El orden importa: 'ing' antes que 's', o "storing" acabaria en "storin".
  const suffixes = ['iendo', 'ando', 'ing', 'ed', 'es', 's'];

  for (const suffix of suffixes) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }

  return word;
}

export function normalizeTitle(title: string): string {
  return (
    title
      // Separa los acentos de su letra para poder quitarlos: asi "replicacion"
      // y "replicación" producen la misma clave.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Fuera puntuacion. Sin esto, "Discord:" y "Discord" son palabras
      // distintas y el mismo tema entra dos veces.
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
      .map(stem)
      // Ordenadas: el orden de las palabras en un titular no cambia el tema.
      .sort()
      .join(' ')
  );
}


export function dedupeKeyFor(title: string): string {
  return createHash('sha1').update(normalizeTitle(title)).digest('hex').slice(0, 16);
}

/** Colapsa duplicados dentro del lote recien recogido. */
export function dedupeWithin(ideas: readonly Idea[]): Idea[] {
  const seen = new Map<string, Idea>();

  for (const idea of ideas) {
    const existing = seen.get(idea.dedupeKey);
    // Ante un duplicado se conserva el que trae fuente propia: casi siempre
    // es el blog original en vez del agregador.
    if (!existing || (!existing.sourceUrl && idea.sourceUrl)) {
      seen.set(idea.dedupeKey, idea);
    }
  }

  return [...seen.values()];
}
