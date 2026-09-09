import { createLogger } from '@osaki/core';
import type { Db } from '@osaki/db';

const log = createLogger('youtube:quota');

/**
 * CUOTA DE LA YOUTUBE DATA API
 *
 * 10.000 unidades al dia por proyecto, y se reinicia a medianoche hora del
 * Pacifico. Una subida cuesta 1.600, asi que caben seis al dia.
 *
 * Esto se lleva en la base de datos y no de memoria porque el proceso se
 * reinicia y la cuota no. Quedarse sin cuota a mitad de una tanda de Shorts
 * deja el trabajo a medias con un error de Google que no dice cuanto queda.
 */

export const QUOTA_COST = {
  /** videos.insert */
  upload: 1600,
  /** thumbnails.set */
  thumbnail: 50,
  /** videos.update */
  update: 50,
  /** videos.list, cualquier lectura */
  read: 1,
} as const;

export const DAILY_QUOTA = 10_000;

/** Dia de cuota en curso, en hora del Pacifico, que es cuando Google reinicia. */
export function quotaDay(now = new Date()): string {
  const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return pacific.toISOString().slice(0, 10);
}

export function spentToday(db: Db, day = quotaDay()): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(units), 0) AS total FROM youtube_quota WHERE day = ?')
    .get(day) as { total: number };
  return row.total;
}

export function remainingToday(db: Db): number {
  return Math.max(0, DAILY_QUOTA - spentToday(db));
}

/**
 * Reserva cuota ANTES de la llamada, no despues.
 *
 * Al reves, dos operaciones lanzadas a la vez pasarian las dos la
 * comprobacion y la segunda fallaria en Google, que es donde el error es
 * opaco y ya se gasto el tiempo de subida.
 */
export function reserveQuota(db: Db, units: number, operation: string): void {
  const day = quotaDay();
  const spent = spentToday(db, day);

  if (spent + units > DAILY_QUOTA) {
    throw new Error(
      `Sin cuota de YouTube para "${operation}": necesita ${units} unidades y ` +
        `quedan ${DAILY_QUOTA - spent} de ${DAILY_QUOTA}.\n` +
        `  La cuota se reinicia a medianoche hora del Pacifico.`,
    );
  }

  db.prepare(
    'INSERT INTO youtube_quota (day, operation, units, spent_at) VALUES (?, ?, ?, ?)',
  ).run(day, operation, units, new Date().toISOString());

  log.debug(`cuota: ${operation} -${units}, quedan ${DAILY_QUOTA - spent - units}`);
}
