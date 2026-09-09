import { z } from 'zod';
import {
  AngleSchema,
  createLogger,
  loadConfig,
  readArtifact,
  writeArtifact,
  type Angle,
  type FactSheet,
} from '@osaki/core';
import { completeJson, createLlmProvider, renderPrompt } from '@osaki/llm';
import { claimsForScript } from '@osaki/research';

const log = createLogger('script:angles');

export const AnglesArtifactSchema = z.object({
  videoId: z.string(),
  angles: z.array(AngleSchema).length(3),
  generatedAt: z.string().datetime(),
  /** Id elegido por el humano. Vacio hasta que apruebas. */
  chosenAngleId: z.string().optional(),
  /** Texto que hayas editado sobre la propuesta elegida. */
  humanNotes: z.string().optional(),
});

export type AnglesArtifact = z.infer<typeof AnglesArtifactSchema>;

const ProposalSchema = z.object({ angles: z.array(AngleSchema).min(3).max(3) });

/**
 * Etapa 3: tres angulos. APROBACION HUMANA #1.
 *
 * Tres y no uno porque la eleccion es tuya, y tres y no diez porque una lista
 * larga no se elige, se hojea. Con tres puedes leerlas enteras y comparar.
 *
 * Esta etapa NO decide. Deja las tres propuestas y se para.
 */
export async function runAnglesStage(videoId: string, sheet: FactSheet): Promise<AnglesArtifact> {
  const provider = createLlmProvider(loadConfig());
  const claims = claimsForScript(sheet);

  const claimList = claims
    .map((claim, index) => `${index + 1}. ${claim.statement}${claim.source ? `  [${claim.source.title}]` : ''}`)
    .join('\n');

  const result = await completeJson(
    provider,
    {
      key: 'angles/propose',
      prompt: renderPrompt('angles/propose.md', {
        topic: sheet.topic,
        claims: claimList,
        claimCount: claims.length,
      }),
      humanHint: `Propon 3 angulos para un video sobre "${sheet.topic}".`,
    },
    ProposalSchema,
  );

  const artifact: AnglesArtifact = {
    videoId,
    angles: result.angles,
    generatedAt: new Date().toISOString(),
  };

  writeArtifact(videoId, 'angles', artifact);
  log.info(`3 angulos propuestos para ${videoId}`);
  return artifact;
}

export function readAngles(videoId: string): AnglesArtifact {
  return readArtifact(videoId, 'angles', AnglesArtifactSchema);
}

/**
 * Registra tu eleccion sobre el artefacto.
 *
 * Se guarda en el propio archivo, junto a las tres propuestas, para que quede
 * claro que elegiste y sobre que alternativas. Esa trazabilidad es parte de
 * la evidencia de aporte creativo humano.
 */
export function chooseAngle(videoId: string, angleId: string, notes?: string): AnglesArtifact {
  const artifact = readAngles(videoId);

  const chosen = artifact.angles.find((angle) => angle.id === angleId);
  if (!chosen) {
    throw new Error(
      `El angulo "${angleId}" no esta entre las propuestas. Disponibles: ` +
        artifact.angles.map((angle) => angle.id).join(', '),
    );
  }

  const updated: AnglesArtifact = { ...artifact, chosenAngleId: angleId, humanNotes: notes };
  writeArtifact(videoId, 'angles', updated);
  return updated;
}

export function chosenAngle(artifact: AnglesArtifact): Angle | null {
  if (!artifact.chosenAngleId) return null;
  return artifact.angles.find((angle) => angle.id === artifact.chosenAngleId) ?? null;
}
