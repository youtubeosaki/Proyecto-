import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { ConfigError } from './errors.js';
import { setLogLevel } from './logger.js';

const boolish = z
  .string()
  .transform((v) => ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

const ConfigSchema = z.object({
  LLM_PROVIDER: z.enum(['mock', 'manual', 'api']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL_PRIMARY: z.string().default('claude-opus-5'),
  LLM_MODEL_UTILITY: z.string().default('claude-haiku-4-5'),
  LLM_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),

  UNVERIFIED_CLAIMS_POLICY: z.enum(['exclude', 'flag']).default('exclude'),
  MIN_VERIFIED_CLAIMS: z.coerce.number().int().positive().default(8),

  VOICE_PROVIDER: z.enum(['file', 'piper', 'elevenlabs']).default('file'),
  PIPER_BIN: z.string().default('piper'),
  PIPER_VOICE_MODEL: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  WHISPER_CPP_BIN: z.string().optional(),
  WHISPER_CPP_MODEL: z.string().optional(),

  FFMPEG_PATH: z.string().optional(),
  RENDER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  RENDER_QUALITY: z.enum(['draft', 'high']).default('high'),

  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REDIRECT_URI: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  YOUTUBE_DEFAULT_PRIVACY: z.enum(['private', 'unlisted']).default('private'),

  N8N_BASE_URL: z.string().default('http://localhost:5678'),
  N8N_WEBHOOK_TOKEN: z.string().optional(),

  DATA_DIR: z.string().default('./data'),
  DATABASE_PATH: z.string().default('./data/osaki.db'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DRY_RUN: boolish.optional(),
});

export type RawConfig = z.infer<typeof ConfigSchema>;

export interface Paths {
  root: string;
  data: string;
  database: string;
  prompts: string;
  /** Artefactos por video: guion, hechos, storyboard, render. */
  videos: string;
  audio: string;
  renders: string;
  /** Buzon del proveedor `manual`: prompts salientes y respuestas entrantes. */
  exchange: string;
  fixtures: string;
}

export interface Config extends RawConfig {
  paths: Paths;
}

let cached: Config | null = null;

/** Sube desde `start` buscando el marcador del monorepo. */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/**
 * Carga y valida la configuracion. Idempotente: la primera llamada hace el
 * trabajo, las siguientes devuelven la copia cacheada.
 */
export function loadConfig(options: { reload?: boolean } = {}): Config {
  if (cached && !options.reload) return cached;

  const root = findRepoRoot(process.cwd());
  loadDotenv({ path: resolve(root, '.env'), quiet: true });

  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(
      `El archivo .env no es valido:\n${problems}\n\nCompara con .env.example.`,
    );
  }

  const raw = parsed.data;
  const data = resolve(root, raw.DATA_DIR);

  cached = {
    ...raw,
    paths: {
      root,
      data,
      database: resolve(root, raw.DATABASE_PATH),
      prompts: resolve(root, 'prompts'),
      videos: resolve(data, 'videos'),
      audio: resolve(data, 'audio'),
      renders: resolve(data, 'renders'),
      exchange: resolve(data, 'exchange'),
      fixtures: resolve(data, 'fixtures'),
    },
  };

  setLogLevel(cached.LOG_LEVEL);
  return cached;
}

/**
 * Comprueba que estan las claves que una etapa concreta necesita, y falla
 * con un mensaje que dice exactamente que rellenar. Se llama al entrar a la
 * etapa, no al arrancar el proceso: no tiene sentido exigir credenciales de
 * YouTube para renderizar un borrador.
 */
export function requireKeys(config: Config, keys: readonly (keyof RawConfig)[], context: string): void {
  const missing = keys.filter((key) => {
    const value = config[key];
    return value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new ConfigError(
      `${context} necesita ${missing.length === 1 ? 'esta clave' : 'estas claves'} en .env: ${missing.join(', ')}`,
    );
  }
}
