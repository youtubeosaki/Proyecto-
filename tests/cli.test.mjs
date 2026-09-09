import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { withTempData } from './helpers.mjs';

/**
 * QUE LOS COMANDOS DOCUMENTADOS EXISTAN
 *
 * Esta prueba nace de un fallo real: al reescribir el comando `doctor`, la
 * edicion se llevo por delante `ideas` y `choose`, que estaban entre medias.
 * El codigo compilaba, la ayuda seguia anunciandolos, y al ejecutarlos caian
 * en el caso por defecto y volvian a imprimir la ayuda. Sin error, sin pista.
 *
 * Se descubrio probando desde un clon limpio, no escribiendo codigo. Esta
 * prueba hace ese trabajo a partir de ahora.
 */

const temp = withTempData();
test.after(() => temp.cleanup());

const CLI = 'packages/cli/dist/index.js';

function run(args) {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env },
  });
}

/** Comandos que la ayuda anuncia y que por tanto tienen que existir. */
const COMANDOS = ['status', 'stages', 'new', 'run', 'choose', 'approve', 'ideas', 'serve', 'doctor'];

test('la ayuda anuncia exactamente los comandos que existen', () => {
  const ayuda = run([]);

  for (const comando of COMANDOS) {
    assert.ok(
      ayuda.includes(`osaki ${comando}`),
      `la ayuda no menciona "${comando}"`,
    );
  }
});

test('ningun comando documentado cae en el caso por defecto', () => {
  const ayuda = run([]);

  // `serve` se queda escuchando y `run` necesita argumentos, asi que se
  // prueban los que responden y terminan.
  for (const comando of ['status', 'stages', 'ideas', 'doctor']) {
    const salida = run([comando]);
    assert.notEqual(
      salida.trim(),
      ayuda.trim(),
      `"${comando}" cayo en el caso por defecto: existe en la ayuda pero no esta implementado`,
    );
  }
});

test('los comandos que necesitan --video lo exigen', () => {
  for (const argumentos of [['choose', 'a1'], ['approve', 'render']]) {
    const ayuda = run([]);
    let salida = '';
    try {
      salida = run(argumentos);
    } catch (error) {
      salida = String(error.stdout ?? '');
    }

    assert.notEqual(
      salida.trim(),
      ayuda.trim(),
      `"${argumentos[0]}" cayo en el caso por defecto en vez de pedir --video`,
    );
  }
});
