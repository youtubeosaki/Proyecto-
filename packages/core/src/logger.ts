/**
 * Logger minimo, sin dependencias. Escribe a stderr para no contaminar
 * el stdout de la CLI, que se usa para pipear JSON entre etapas.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

let threshold: number = LEVELS.info;

export function setLogLevel(level: LogLevel): void {
  threshold = LEVELS[level];
}

const COLOR: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

function emit(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const time = new Date().toISOString().slice(11, 19);
  const tint = process.stderr.isTTY ? COLOR[level] : '';
  const reset = process.stderr.isTTY ? '\x1b[0m' : '';
  let line = `${tint}${time} ${level.padEnd(5)}${reset} [${scope}] ${message}`;
  if (extra !== undefined) {
    line += ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`;
  }
  process.stderr.write(line + '\n');
}

export interface Logger {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
  child(subScope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, e) => emit('debug', scope, m, e),
    info: (m, e) => emit('info', scope, m, e),
    warn: (m, e) => emit('warn', scope, m, e),
    error: (m, e) => emit('error', scope, m, e),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}
