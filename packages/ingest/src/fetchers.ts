import { XMLParser } from 'fast-xml-parser';
import { ProviderError, createLogger, makeId, withRetry, type Idea } from '@osaki/core';
import { HACKERNEWS, RSS_SOURCES, type FeedSource } from './sources.js';
import { dedupeKeyFor } from './dedupe.js';

const log = createLogger('ingest');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Un feed con un solo item devolveria un objeto en vez de un array, y eso
  // obliga a comprobar el tipo en cada acceso. Mejor forzarlo siempre a array.
  isArray: (name) => ['item', 'entry'].includes(name),
});

const USER_AGENT = 'osaki-pipeline/0.1 (+https://github.com/youtubeosaki)';

async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml, */*' },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new ProviderError(`${url} devolvio ${response.status}`, {
            retryable: response.status === 429 || response.status >= 500,
          });
        }
        return await response.text();
      } finally {
        clearTimeout(timer);
      }
    },
    { logger: log, label: `fetch ${new URL(url).hostname}` },
  );
}

/** Quita etiquetas y normaliza espacios. Los resumenes de RSS traen HTML. */
function stripHtml(input: string, maxLength = 400): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

interface RawEntry {
  title?: string | { '#text'?: string };
  link?: string | { '@_href'?: string } | { '@_href'?: string }[];
  description?: string;
  summary?: string | { '#text'?: string };
  content?: string | { '#text'?: string };
  pubDate?: string;
  published?: string;
  updated?: string;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as { '#text'?: unknown })['#text'] ?? '');
  }
  return '';
}

/** RSS y Atom difieren en casi todos los nombres de campo. Se normalizan aqui. */
function linkOf(entry: RawEntry): string | undefined {
  if (typeof entry.link === 'string') return entry.link;
  if (Array.isArray(entry.link)) {
    const alternate = entry.link.find((item) => item['@_href']);
    return alternate?.['@_href'];
  }
  if (entry.link && typeof entry.link === 'object' && '@_href' in entry.link) {
    return entry.link['@_href'];
  }
  return undefined;
}

export async function fetchFeed(source: FeedSource): Promise<Idea[]> {
  const xml = await fetchText(source.url);
  const document = parser.parse(xml) as Record<string, any>;

  const entries: RawEntry[] = document?.rss?.channel?.item ?? document?.feed?.entry ?? [];

  return entries.slice(0, 20).flatMap((entry): Idea[] => {
    const title = textOf(entry.title).trim();
    if (!title) return [];

    const rawSummary =
      (typeof entry.description === 'string' ? entry.description : '') ||
      textOf(entry.summary) ||
      textOf(entry.content);

    const published = entry.pubDate ?? entry.published ?? entry.updated;
    const discoveredAt = published ? new Date(published) : new Date();

    return [
      {
        id: makeId('idea'),
        title,
        summary: stripHtml(rawSummary),
        sourceType: 'rss',
        sourceUrl: linkOf(entry),
        dedupeKey: dedupeKeyFor(title),
        discoveredAt: (Number.isNaN(discoveredAt.getTime()) ? new Date() : discoveredAt).toISOString(),
      },
    ];
  });
}

export async function fetchHackerNews(): Promise<Idea[]> {
  const since = Math.floor(Date.now() / 1000) - HACKERNEWS.windowDays * 86_400;
  const url =
    `${HACKERNEWS.endpoint}?tags=story&numericFilters=` +
    `points>${HACKERNEWS.minPoints},created_at_i>${since}&hitsPerPage=40`;

  const payload = JSON.parse(await fetchText(url)) as {
    hits?: { title?: string; url?: string; points?: number; created_at?: string }[];
  };

  return (payload.hits ?? []).flatMap((hit): Idea[] => {
    if (!hit.title) return [];
    return [
      {
        id: makeId('idea'),
        title: hit.title,
        summary: `Hacker News, ${hit.points ?? 0} puntos.`,
        sourceType: 'hackernews',
        sourceUrl: hit.url,
        dedupeKey: dedupeKeyFor(hit.title),
        discoveredAt: hit.created_at ?? new Date().toISOString(),
      },
    ];
  });
}

/**
 * Recoge de todas las fuentes.
 *
 * Un feed caido no puede tumbar la etapa: se avisa y se sigue con el resto.
 * Perder una fuente de ocho es un mal dia; abortar la ingesta entera por una
 * es un bug.
 */
export async function fetchAllSources(): Promise<Idea[]> {
  const jobs: Promise<Idea[]>[] = [
    ...RSS_SOURCES.map((source) =>
      fetchFeed(source).catch((error: unknown) => {
        log.warn(`fuente caida: ${source.name}`, error instanceof Error ? error.message : error);
        return [] as Idea[];
      }),
    ),
    fetchHackerNews().catch((error: unknown) => {
      log.warn('Hacker News no responde', error instanceof Error ? error.message : error);
      return [] as Idea[];
    }),
  ];

  const results = await Promise.all(jobs);
  const ideas = results.flat();
  log.info(`recogidas ${ideas.length} ideas de ${jobs.length} fuentes`);
  return ideas;
}
