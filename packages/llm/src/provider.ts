import type { z } from 'zod';

/**
 * La interfaz que ve el resto del pipeline. Ninguna etapa sabe si detras hay
 * la API de Anthropic, un archivo de fixture o tu copiando y pegando en
 * claude.ai. Ese es el punto.
 */
export interface LlmProvider {
  readonly name: 'mock' | 'manual' | 'api';

  /**
   * Ejecuta un prompt y devuelve texto crudo.
   * `key` identifica la llamada de forma estable: nombra el fixture en `mock`
   * y el archivo del buzon en `manual`.
   */
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export interface CompletionRequest {
  /** Identificador estable de esta llamada, p.ej. `research/investigate`. */
  key: string;
  system?: string;
  prompt: string;
  /** `primary` para trabajo creativo, `utility` para lo mecanico. */
  tier?: 'primary' | 'utility';
  maxTokens?: number;
  /** Contexto que se muestra al humano en el modo `manual`. */
  humanHint?: string;
}

export interface CompletionResult {
  text: string;
  provider: LlmProvider['name'];
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Igual que `complete`, pero valida la salida contra un schema de zod.
 *
 * Extrae el primer bloque JSON del texto: los modelos rodean el JSON de
 * prosa con frecuencia, y fallar por eso seria fragil sin necesidad.
 */
export async function completeJson<T>(
  provider: LlmProvider,
  request: CompletionRequest,
  // El tercer parametro fija T al tipo de SALIDA del schema. Sin el, un
  // schema con `.default()` liga T a su tipo de entrada y los campos con
  // default salen opcionales pese a estar siempre presentes tras parsear.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  const { text } = await provider.complete(request);
  const json = extractJson(text);
  return schema.parse(json);
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fenced?.[1]) candidates.unshift(fenced[1]);

  const firstBrace = trimmed.search(/[[{]/);
  const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // siguiente candidato
    }
  }

  throw new Error(`La respuesta no contiene JSON valido. Empieza por: ${trimmed.slice(0, 200)}`);
}
