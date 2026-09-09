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

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .sort()
    .join(' ');
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
