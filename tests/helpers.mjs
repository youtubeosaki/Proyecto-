import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Cada prueba corre sobre un directorio de datos NUEVO.
 *
 * Compartir la base entre pruebas hace que el orden importe, y una suite en
 * la que el orden importa acaba fallando por motivos que no tienen que ver
 * con lo que se esta probando.
 */
export function withTempData() {
  const dir = mkdtempSync(join(tmpdir(), 'osaki-test-'));

  process.env.DATA_DIR = dir;
  process.env.DATABASE_PATH = join(dir, 'test.db');
  process.env.N8N_WEBHOOK_TOKEN = 'token-de-prueba';
  process.env.LLM_PROVIDER = 'mock';

  return {
    dir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Recarga la configuracion tras cambiar las variables de entorno. */
export async function freshConfig() {
  const core = await import('../packages/core/dist/index.js');
  return core.loadConfig({ reload: true });
}
