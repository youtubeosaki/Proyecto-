/**
 * Errores tipados del pipeline.
 *
 * La distincion que importa: `retryable` decide si `withRetry` reintenta.
 * Un 429 o un 503 se reintentan; un prompt mal formado o una fuente
 * inexistente no, por mucho que lo intentes.
 */

export type StageName =
  | 'ideas'
  | 'research'
  | 'angles'
  | 'script'
  | 'storyboard'
  | 'audio'
  | 'render'
  | 'packaging'
  | 'shorts'
  | 'publish'
  | 'analytics';

export class OsakiError extends Error {
  readonly retryable: boolean;
  readonly stage?: StageName;
  readonly details?: unknown;

  constructor(
    message: string,
    opts: { retryable?: boolean; stage?: StageName; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.retryable = opts.retryable ?? false;
    this.stage = opts.stage;
    this.details = opts.details;
  }
}

/** El .env no cumple el schema, o falta una clave que la etapa necesita. */
export class ConfigError extends OsakiError {}

/** Fallo hablando con un servicio externo. Casi siempre reintentable. */
export class ProviderError extends OsakiError {
  constructor(message: string, opts: ConstructorParameters<typeof OsakiError>[1] = {}) {
    super(message, { retryable: true, ...opts });
  }
}

/** La salida del modelo no respeta el contrato esperado. No reintentable a ciegas. */
export class ContractError extends OsakiError {}

/**
 * La etapa se detuvo a proposito porque falta algo que un humano debe aportar.
 * No es un bug: es el pipeline haciendo su trabajo. La CLI lo reporta distinto.
 */
export class HumanInputRequiredError extends OsakiError {
  readonly instructions: string;

  constructor(message: string, instructions: string, stage?: StageName) {
    super(message, { retryable: false, stage });
    this.instructions = instructions;
  }
}

/** Una escena del guion pide un componente de Remotion que no existe. */
export class MissingSceneComponentError extends OsakiError {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `El storyboard pide ${missing.length} componente(s) de escena que no existen: ${missing.join(', ')}`,
      { stage: 'storyboard' },
    );
    this.missing = missing;
  }
}
