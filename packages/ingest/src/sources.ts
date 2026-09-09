/**
 * Fuentes del banco de ideas.
 *
 * Blogs de ingenieria de equipos que publican como funcionan sus sistemas por
 * dentro. Ese es el criterio: no "blogs de tecnologia", sino equipos que
 * cuentan sus propios mecanismos. Es de donde salen los temas que se pueden
 * explicar con fuente primaria.
 */

export interface FeedSource {
  name: string;
  url: string;
  /** Peso al puntuar. Un feed que suele dar buenos temas empuja mas. */
  weight: number;
}

export const RSS_SOURCES: readonly FeedSource[] = [
  { name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/', weight: 1.2 },
  { name: 'Netflix Tech Blog', url: 'https://netflixtechblog.com/feed', weight: 1.1 },
  { name: 'Discord Engineering', url: 'https://discord.com/blog/rss.xml', weight: 1.0 },
  { name: 'Stripe Engineering', url: 'https://stripe.com/blog/feed.rss', weight: 1.0 },
  { name: 'GitHub Engineering', url: 'https://github.blog/engineering/feed/', weight: 0.9 },
  { name: 'Uber Engineering', url: 'https://www.uber.com/blog/engineering/rss/', weight: 0.9 },
  { name: 'Meta Engineering', url: 'https://engineering.fb.com/feed/', weight: 0.9 },
  { name: 'AWS Architecture', url: 'https://aws.amazon.com/blogs/architecture/feed/', weight: 0.8 },
];

/**
 * Hacker News via la API de Algolia. Se filtra por puntuacion minima porque
 * el interes del canal esta en lo que ya demostro llamar la atencion de
 * gente tecnica, no en todo lo que se publica.
 */
export const HACKERNEWS = {
  endpoint: 'https://hn.algolia.com/api/v1/search',
  minPoints: 150,
  windowDays: 7,
} as const;
