import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OsakiError, loadConfig } from '@osaki/core';

/**
 * Carga un prompt desde `prompts/` y sustituye los placeholders `{{nombre}}`.
 *
 * Los prompts viven en archivos versionados, nunca en el codigo: cambiar una
 * instruccion es un diff legible, y puedes ver en git por que un guion salio
 * distinto la semana pasada.
 */
export function renderPrompt(
  relativePath: string,
  variables: Record<string, string | number> = {},
): string {
  const path = join(loadConfig().paths.prompts, relativePath);

  if (!existsSync(path)) {
    throw new OsakiError(`No existe el prompt "${relativePath}". Buscado en: ${path}`);
  }

  const template = readFileSync(path, 'utf8');
  const missing: string[] = [];

  const rendered = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      missing.push(name);
      return '';
    }
    return String(value);
  });

  if (missing.length > 0) {
    throw new OsakiError(
      `Al prompt "${relativePath}" le faltan variables: ${[...new Set(missing)].join(', ')}`,
    );
  }

  return rendered;
}
