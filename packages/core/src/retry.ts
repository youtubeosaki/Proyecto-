import { OsakiError } from './errors.js';
import type { Logger } from './logger.js';

export interface RetryOptions {
  /** Numero total de intentos, incluido el primero. */
  attempts?: number;
  /** Espera base en ms. Se duplica en cada intento. */
  baseDelayMs?: number;
  /** Techo de la espera, para que el backoff no se dispare. */
  maxDelayMs?: number;
  logger?: Logger;
  label?: string;
  /** Decide si un error concreto merece otro intento. */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Por defecto reintentamos lo que el propio error declara reintentable, mas
 * los codigos HTTP que sabemos transitorios y los cortes de red.
 */
export function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof OsakiError) return error.retryable;

  const status = (error as { status?: number } | null)?.status;
  if (typeof status === 'number') {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  const code = (error as { code?: string } | null)?.code;
  if (typeof code === 'string') {
    return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'].includes(code);
  }

  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reintento con backoff exponencial y jitter completo.
 *
 * El jitter no es decoracion: sin el, varias etapas que arrancan a la vez y
 * chocan con el mismo 429 reintentan en el mismo instante y vuelven a chocar.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 4,
    baseDelayMs = 1_000,
    maxDelayMs = 30_000,
    logger,
    label = 'operacion',
    isRetryable = defaultIsRetryable,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === attempts || !isRetryable(error)) throw error;

      const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delay = Math.round(Math.random() * ceiling);
      logger?.warn(
        `${label} fallo (intento ${attempt}/${attempts}), reintento en ${delay}ms`,
        error instanceof Error ? error.message : String(error),
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
