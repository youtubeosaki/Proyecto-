import Anthropic from '@anthropic-ai/sdk';
import {
  ProviderError,
  createLogger,
  loadConfig,
  requireKeys,
  withRetry,
  type Config,
} from '@osaki/core';
import type { CompletionRequest, CompletionResult, LlmProvider } from '../provider.js';

const log = createLogger('llm:api');

/**
 * Cliente de la API de Anthropic.
 *
 * Streaming siempre: los guiones y los documentos de hechos son salidas largas,
 * y sin streaming se comen el timeout HTTP del SDK.
 */
export class ApiProvider implements LlmProvider {
  readonly name = 'api' as const;
  private readonly client: Anthropic;
  private readonly config: Config;

  constructor(config: Config = loadConfig()) {
    requireKeys(config, ['ANTHROPIC_API_KEY'], 'El proveedor de LLM "api"');
    this.config = config;
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const model =
      request.tier === 'utility' ? this.config.LLM_MODEL_UTILITY : this.config.LLM_MODEL_PRIMARY;

    return withRetry(
      async () => {
        try {
          const stream = this.client.messages.stream({
            model,
            max_tokens: request.maxTokens ?? 32_000,
            thinking: { type: 'adaptive' },
            output_config: { effort: this.config.LLM_EFFORT },
            ...(request.system ? { system: request.system } : {}),
            messages: [{ role: 'user', content: request.prompt }],
          });

          const message = await stream.finalMessage();

          if (message.stop_reason === 'refusal') {
            throw new ProviderError(
              `El modelo rechazo la peticion "${request.key}": ${message.stop_details?.explanation ?? 'sin detalle'}`,
              { retryable: false },
            );
          }

          const text = message.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('');

          log.debug(`${request.key} -> ${message.usage.output_tokens} tokens de salida`);

          return {
            text,
            provider: this.name,
            model,
            usage: {
              inputTokens: message.usage.input_tokens,
              outputTokens: message.usage.output_tokens,
            },
          };
        } catch (error) {
          if (error instanceof ProviderError) throw error;
          if (error instanceof Anthropic.APIError) {
            throw new ProviderError(`La API de Anthropic devolvio ${error.status}: ${error.message}`, {
              // 4xx que no sea 408/409/429 no se arregla reintentando.
              retryable:
                error.status === undefined ||
                error.status === 408 ||
                error.status === 409 ||
                error.status === 429 ||
                error.status >= 500,
              cause: error,
            });
          }
          throw error;
        }
      },
      { logger: log, label: `llm:${request.key}` },
    );
  }
}
