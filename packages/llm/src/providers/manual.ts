import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HumanInputRequiredError, createLogger, loadConfig } from '@osaki/core';
import type { CompletionRequest, CompletionResult, LlmProvider } from '../provider.js';

const log = createLogger('llm:manual');

/**
 * Puente de copiar y pegar contra tu suscripcion de claude.ai.
 *
 * Primera pasada: escribe el prompt completo a disco y se detiene.
 * Tu lo pegas en claude.ai, pegas la respuesta en el archivo de respuesta.
 * Segunda pasada: encuentra la respuesta y continua donde estaba.
 *
 * No consume creditos de API. La etapa que lo llama no nota la diferencia.
 */
export class ManualProvider implements LlmProvider {
  readonly name = 'manual' as const;

  constructor(private readonly exchangeDir = loadConfig().paths.exchange) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const safeKey = request.key.replace(/[/\\]/g, '__');
    const dir = join(this.exchangeDir, safeKey);
    mkdirSync(dir, { recursive: true });

    const promptPath = join(dir, 'prompt.md');
    const responsePath = join(dir, 'response.md');

    if (existsSync(responsePath)) {
      const text = readFileSync(responsePath, 'utf8').trim();
      if (text.length > 0) {
        log.info(`respuesta recogida para ${request.key}`);
        return { text, provider: this.name };
      }
    }

    const body = [
      request.system ? `<!-- Pega esto como primer mensaje -->\n\n${request.system}\n\n---\n` : '',
      request.prompt,
    ].join('\n');

    writeFileSync(promptPath, body, 'utf8');
    if (!existsSync(responsePath)) writeFileSync(responsePath, '', 'utf8');

    throw new HumanInputRequiredError(
      `El proveedor "manual" necesita tu respuesta para "${request.key}".`,
      [
        request.humanHint ?? '',
        '',
        `1. Abre y copia:  ${promptPath}`,
        '2. Pegalo en claude.ai y espera la respuesta.',
        `3. Pega la respuesta en:  ${responsePath}`,
        '4. Vuelve a ejecutar exactamente el mismo comando. Continuara desde aqui.',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}
