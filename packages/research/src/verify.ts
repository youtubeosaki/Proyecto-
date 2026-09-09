import { z } from 'zod';
import { createLogger, type Claim, type Config } from '@osaki/core';
import { completeJson, renderPrompt, type LlmProvider } from '@osaki/llm';

const log = createLogger('research:verify');

const VerdictSchema = z.object({
  claims: z.array(
    z.object({
      id: z.string(),
      verified: z.boolean(),
      verificationNote: z.string().nullable().optional(),
    }),
  ),
});

/**
 * URLs que un modelo inventa con frecuencia. No es una lista de dominios
 * prohibidos: son formas que delatan una cita fabricada.
 */
function looksFabricated(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'la URL no es una URL valida';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'la URL no usa http(s)';
  }
  if (/example\.(com|org|net)$/i.test(parsed.hostname)) {
    return 'la URL apunta a un dominio de ejemplo';
  }
  // Un identificador larguisimo y opaco en la ruta suele ser un hash inventado.
  if (/\/[0-9a-f]{24,}(\/|$)/i.test(parsed.pathname)) {
    return 'la ruta contiene un identificador que parece generado';
  }
  return null;
}

/**
 * Reglas mecanicas previas al revisor.
 *
 * Se aplican ANTES de gastar tokens porque no hace falta un modelo para
 * rechazar una afirmacion que no trae fuente. Y porque una regla determinista
 * no se deja convencer: el revisor es un modelo y los modelos se dejan
 * arrastrar por una cita bien escrita.
 */
export function applyMechanicalRules(claims: readonly Claim[]): Claim[] {
  return claims.map((claim): Claim => {
    if (!claim.source) {
      return { ...claim, verified: false, verificationNote: 'Sin fuente.' };
    }
    if (claim.source.tier === 'weak') {
      return { ...claim, verified: false, verificationNote: 'La fuente es de nivel debil.' };
    }
    if (!claim.supportingQuote || claim.supportingQuote.trim().length < 15) {
      return {
        ...claim,
        verified: false,
        verificationNote: 'Sin cita literal que sostenga la afirmacion.',
      };
    }
    const suspicious = looksFabricated(claim.source.url);
    if (suspicious) {
      return { ...claim, verified: false, verificationNote: `Fuente sospechosa: ${suspicious}.` };
    }
    // Sobrevive a las reglas mecanicas. Todavia no esta verificada: eso lo
    // decide el revisor.
    return { ...claim, verified: false, verificationNote: undefined };
  });
}

/**
 * Segunda pasada: un revisor que trabaja EN CONTRA del investigador.
 *
 * Que sean dos llamadas distintas y no una sola con instrucciones de "se
 * riguroso" no es ceremonia. En una sola pasada el modelo juzga su propio
 * trabajo y lo aprueba casi todo; separandolas, el revisor recibe las
 * afirmaciones sin contexto de quien las escribio ni por que.
 */
export async function verifyClaims(
  provider: LlmProvider,
  config: Config,
  claims: readonly Claim[],
): Promise<Claim[]> {
  const candidates = applyMechanicalRules(claims);

  // Solo van al revisor las que pasaron el filtro mecanico.
  const reviewable = candidates.filter((claim) => claim.verificationNote === undefined);

  if (reviewable.length === 0) {
    log.warn('ninguna afirmacion supero el filtro mecanico');
    return candidates;
  }

  const payload = JSON.stringify(
    reviewable.map((claim) => ({
      id: claim.id,
      statement: claim.statement,
      supportingQuote: claim.supportingQuote,
      source: claim.source,
    })),
    null,
    2,
  );

  const verdict = await completeJson(
    provider,
    {
      key: 'research/verify-claims',
      prompt: renderPrompt('research/verify-claims.md', { claimsJson: payload }),
      humanHint:
        'Revisa que afirmaciones estan realmente sostenidas por su fuente. Ante la duda, rechaza.',
    },
    VerdictSchema,
  );

  const byId = new Map(verdict.claims.map((entry) => [entry.id, entry]));

  const result = candidates.map((claim): Claim => {
    if (claim.verificationNote !== undefined) return claim;

    const entry = byId.get(claim.id);
    if (!entry) {
      // El revisor no se pronuncio. Silencio no es aprobacion.
      return {
        ...claim,
        verified: false,
        verificationNote: 'El revisor no emitio veredicto sobre esta afirmacion.',
      };
    }

    return {
      ...claim,
      verified: entry.verified,
      verificationNote: entry.verified ? undefined : (entry.verificationNote ?? 'Rechazada por el revisor.'),
    };
  });

  const passed = result.filter((claim) => claim.verified).length;
  log.info(`verificadas ${passed} de ${claims.length} afirmaciones`);

  if (config.UNVERIFIED_CLAIMS_POLICY === 'flag') {
    log.warn('UNVERIFIED_CLAIMS_POLICY=flag: las no verificadas llegaran al guion marcadas');
  }

  return result;
}
