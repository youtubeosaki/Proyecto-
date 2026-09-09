import { z } from 'zod';

/* ---------------------------------------------------------------------------
 * Etapas y estado
 * ------------------------------------------------------------------------ */

/**
 * El orden de este array ES la maquina de estados. Una etapa solo puede
 * ejecutarse si la anterior dejo su artefacto en disco, y `osaki status`
 * lo renderiza en este orden.
 */
export const STAGE_ORDER = [
  'ideas',
  'research',
  'angles',
  'script',
  'storyboard',
  'audio',
  'render',
  'packaging',
  'shorts',
  'publish',
  'analytics',
] as const;

export type Stage = (typeof STAGE_ORDER)[number];

/**
 * Los dos puntos donde el pipeline se detiene y espera a un humano.
 * Estan aqui, en los tipos, no en la configuracion de n8n: quien lea el
 * codigo debe tropezarse con ellos.
 */
export const HUMAN_GATES = {
  /** Aprobacion #1: eliges uno de los 3 angulos propuestos. */
  angles: 'angles',
  /** Aprobacion #2: ves el video renderizado antes de que exista una subida. */
  render: 'render',
} as const satisfies Partial<Record<Stage, Stage>>;

export type HumanGate = keyof typeof HUMAN_GATES;

export function isHumanGate(stage: Stage): stage is HumanGate {
  return stage in HUMAN_GATES;
}

export const StageStatusSchema = z.enum([
  'pending',
  'running',
  'awaiting_approval',
  'approved',
  'rejected',
  'done',
  'failed',
]);
export type StageStatus = z.infer<typeof StageStatusSchema>;

/* ---------------------------------------------------------------------------
 * Banco de ideas
 * ------------------------------------------------------------------------ */

export const IdeaSourceSchema = z.enum(['rss', 'hackernews', 'paper', 'manual']);

export const IdeaScoreSchema = z.object({
  /** Cuanta gente busca activamente esto. 0-10. */
  searchPotential: z.number().min(0).max(10),
  /** Hay un "espera, que?" en el tema. Sin esto el video no engancha. 0-10. */
  counterintuitiveHook: z.number().min(0).max(10),
  /** Se puede dibujar. Un tema que solo se puede narrar no sirve a este canal. 0-10. */
  visualExplainability: z.number().min(0).max(10),
  reasoning: z.string(),
});
export type IdeaScore = z.infer<typeof IdeaScoreSchema>;

export const IdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  sourceType: IdeaSourceSchema,
  sourceUrl: z.string().url().optional(),
  /** Hash del titulo normalizado. Es como deduplicamos contra lo ya publicado. */
  dedupeKey: z.string(),
  score: IdeaScoreSchema.optional(),
  /** Media ponderada de score, precalculada para poder ordenar en SQL. */
  compositeScore: z.number().optional(),
  discoveredAt: z.string().datetime(),
});
export type Idea = z.infer<typeof IdeaSchema>;

/* ---------------------------------------------------------------------------
 * Investigacion y verificacion
 *
 * Este es el nucleo del sistema. Una afirmacion tecnica sin fuente primaria
 * recuperable no llega al guion.
 * ------------------------------------------------------------------------ */

export const SourceTierSchema = z.enum([
  /** RFC, paper, documentacion oficial, post de ingenieria del propio equipo. */
  'primary',
  /** Cobertura de terceros que cita a una primaria. */
  'secondary',
  /** Blog sin citas, respuesta de foro, contenido generado. No cuenta. */
  'weak',
]);
export type SourceTier = z.infer<typeof SourceTierSchema>;

export const SourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  tier: SourceTierSchema,
  publisher: z.string().optional(),
  retrievedAt: z.string().datetime(),
});
export type Source = z.infer<typeof SourceSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  /** La afirmacion, en una frase, tal como podria decirse en el guion. */
  statement: z.string(),
  /** Cita literal de la fuente que la sostiene. Sin parafrasear. */
  supportingQuote: z.string().optional(),
  source: SourceSchema.optional(),
  verified: z.boolean(),
  /** Por que no se verifico. Se muestra en el reporte de descartes. */
  verificationNote: z.string().optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const FactSheetSchema = z.object({
  videoId: z.string(),
  topic: z.string(),
  claims: z.array(ClaimSchema),
  /** Preguntas abiertas que la investigacion no pudo cerrar. */
  openQuestions: z.array(z.string()).default([]),
  generatedAt: z.string().datetime(),
});
export type FactSheet = z.infer<typeof FactSheetSchema>;

/** Solo las afirmaciones verificadas llegan al generador de guion. */
export function verifiedClaims(sheet: FactSheet): Claim[] {
  return sheet.claims.filter((claim) => claim.verified);
}

export function rejectedClaims(sheet: FactSheet): Claim[] {
  return sheet.claims.filter((claim) => !claim.verified);
}

/* ---------------------------------------------------------------------------
 * Angulos y guion
 * ------------------------------------------------------------------------ */

export const AngleSchema = z.object({
  id: z.string(),
  /** El gancho, tal cual se diria en los primeros 10 segundos. */
  hook: z.string(),
  title: z.string(),
  /** Que se lleva el espectador. Una frase. */
  thesis: z.string(),
  beats: z.array(z.string()),
  whyThisWorks: z.string(),
});
export type Angle = z.infer<typeof AngleSchema>;

export const SceneMarkerSchema = z.object({
  /** Id del componente de Remotion. Se valida contra el registro de escenas. */
  kind: z.string(),
  /** Texto crudo entre corchetes, para poder rastrear el origen en el guion. */
  raw: z.string(),
  /** Props sugeridas por el modelo. Se validan contra el schema del componente. */
  props: z.record(z.unknown()).default({}),
});
export type SceneMarker = z.infer<typeof SceneMarkerSchema>;

export const ScriptSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  /** Lo que se narra. Esto y solo esto va al TTS o a tu grabacion. */
  narration: z.string(),
  scene: SceneMarkerSchema.optional(),
  /** Ids de las Claim que sostienen este segmento. Trazabilidad hasta la fuente. */
  claimIds: z.array(z.string()).default([]),
});
export type ScriptSegment = z.infer<typeof ScriptSegmentSchema>;

export const ScriptSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  angleId: z.string(),
  segments: z.array(ScriptSegmentSchema),
  estimatedWords: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});
export type Script = z.infer<typeof ScriptSchema>;

/* ---------------------------------------------------------------------------
 * Timing y composicion
 * ------------------------------------------------------------------------ */

export const SceneTimingSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  startFrame: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  /** Duracion real medida del audio, en segundos. La fuente de verdad del timing. */
  audioSeconds: z.number().nonnegative(),
});
export type SceneTiming = z.infer<typeof SceneTimingSchema>;

export const StoryboardSchema = z.object({
  videoId: z.string(),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  scenes: z.array(
    z.object({
      segmentIndex: z.number().int().nonnegative(),
      kind: z.string(),
      props: z.record(z.unknown()),
      timing: SceneTimingSchema.optional(),
    }),
  ),
  generatedAt: z.string().datetime(),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

/* ---------------------------------------------------------------------------
 * Registro de video
 * ------------------------------------------------------------------------ */

export const VideoRecordSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  ideaId: z.string().optional(),
  stage: z.enum(STAGE_ORDER),
  status: StageStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
  youtubeVideoId: z.string().optional(),
});
export type VideoRecord = z.infer<typeof VideoRecordSchema>;
