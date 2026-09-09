import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OsakiError, createLogger, loadConfig } from '@osaki/core';
import type { CompletionRequest, CompletionResult, LlmProvider } from '../provider.js';

const log = createLogger('llm:mock');

/**
 * Lee respuestas desde `data/fixtures/<key>.txt`. Gasto cero.
 *
 * Sirve para dos cosas: desarrollar el pipeline sin pagar nada, y tener tests
 * deterministas. Si falta el fixture falla con la ruta exacta que crear, no
 * con una respuesta inventada.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock' as const;

  constructor(private readonly fixturesDir = loadConfig().paths.fixtures) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const path = join(this.fixturesDir, `${request.key}.txt`);

    if (!existsSync(path)) {
      throw new OsakiError(
        `Falta el fixture para "${request.key}".\n` +
          `  Crealo en: ${path}\n` +
          `  O cambia LLM_PROVIDER en .env a "manual" o "api".`,
      );
    }

    log.debug(`fixture ${request.key}`);
    return { text: readFileSync(path, 'utf8'), provider: this.name };
  }
}
