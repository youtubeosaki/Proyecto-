import { randomBytes } from 'node:crypto';

/**
 * Identificador legible y ordenable por tiempo: `vid_20260909_a3f1c2`.
 * Ordenable importa porque los directorios de artefactos se listan a mano
 * a menudo y quieres ver el ultimo abajo del todo.
 */
export function makeId(prefix: string): string {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  return `${prefix}_${stamp}_${randomBytes(3).toString('hex')}`;
}

/** Convierte texto libre en algo seguro para nombres de archivo y URLs. */
export function slugify(input: string, maxLength = 60): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}
