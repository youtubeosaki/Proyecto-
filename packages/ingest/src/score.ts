import { z } from 'zod';
import { IdeaScoreSchema, createLogger, type Idea } from '@osaki/core';
import { completeJson, renderPrompt, type LlmProvider } from '@osaki/llm';

const log = createLogger('ingest:score');

const ScoredBatchSchema = z.object({
  scores: z.array(
    IdeaScoreSchema.extend({
      id: z.string(),
    }),
  ),
});

/**
 * Pesos del score compuesto.
 *
 * El gancho contraintuitivo pesa mas que el potencial de busqueda a
 * proposito. Un tema muy buscado sin gancho ya lo cubren cien canales y no
 * hay forma de competir; un tema con gancho real y busqueda media es donde
 * un canal nuevo puede ganar. Y sin explicabilidad visual no hay video que
 * hacer, por eso ese peso tampoco es bajo.
 */
const WEIGHTS = {
  searchPotential: 0.3,
  counterintuitiveHook: 0.42,
  visualExplainability: 0.28,
} as const;

export function compositeScore(score: {
  searchPotential: number;
  counterintuitiveHook: number;
  visualExplainability: number;
}): number {
  return Number(
    (
      score.searchPotential * WEIGHTS.searchPotential +
      score.counterintuitiveHook * WEIGHTS.counterintuitiveHook +
      score.visualExplainability * WEIGHTS.visualExplainability
    ).toFixed(3),
  );
}

/**
 * Puntua un lote de ideas en una sola llamada.
 *
 * En lote y no una a una por dos razones: cuesta una fraccion de los tokens,
 * y el modelo puntua mejor cuando ve el conjunto porque puede comparar entre
 * candidatos en vez de calibrar a ciegas cada uno.
 */
export async function scoreIdeas(provider: LlmProvider, ideas: readonly Idea[]): Promise<Idea[]> {
  if (ideas.length === 0) return [];

  const catalog = ideas
    .map((idea) => `- id: ${idea.id}\n  titulo: ${idea.title}\n  resumen: ${idea.summary || '(sin resumen)'}`)
    .join('\n');

  const result = await completeJson(
    provider,
    {
      key: 'ideas/score',
      prompt: renderPrompt('ideas/score.md', { ideas: catalog, count: ideas.length }),
      tier: 'utility',
      humanHint: 'Puntua las ideas del banco por potencial de busqueda, gancho y explicabilidad visual.',
    },
    ScoredBatchSchema,
  );

  const byId = new Map(result.scores.map((score) => [score.id, score]));
  let scored = 0;

  const output = ideas.map((idea): Idea => {
    const score = byId.get(idea.id);
    if (!score) return idea;
    scored++;
    const { id: _ignored, ...rest } = score;
    return { ...idea, score: rest, compositeScore: compositeScore(rest) };
  });

  if (scored < ideas.length) {
    // No es fatal: las que falten quedan sin puntuar y al final de la lista.
    log.warn(`el modelo puntuo ${scored} de ${ideas.length} ideas`);
  }

  return output;
}
