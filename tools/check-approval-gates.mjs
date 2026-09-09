#!/usr/bin/env node
/**
 * Comprueba que los workflows de n8n respetan los dos gates humanos.
 *
 * Por que esto es un script y no un comentario en el README: el grafo de n8n
 * se edita arrastrando cajas en una interfaz grafica. Es facilisimo mover una
 * arista sin darse cuenta de que acaba de saltarse una aprobacion, y el fallo
 * no se nota hasta que un video se publica solo.
 *
 * COMO FUNCIONA
 *
 * Para cada nodo calcula el MINIMO numero de nodos de aprobacion que hay en
 * algun camino desde un disparador hasta el. Si ese minimo es menor que el
 * que exige la etapa que llama, existe una ruta que se salta un gate.
 *
 * El minimo, y no el maximo ni el de un camino cualquiera: basta con que
 * exista UNA ruta que evite la aprobacion para que la garantia se rompa.
 *
 *   node tools/check-approval-gates.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_DIR = join(process.cwd(), 'n8n', 'workflows');
const WAIT_TYPE = 'n8n-nodes-base.wait';

/** Cuantas aprobaciones tiene que haber atravesado cada etapa protegida. */
const GATED = [
  { fragment: '/stages/script', gatesRequired: 1, why: 'el guion exige haber elegido angulo' },
  { fragment: '/stages/publish', gatesRequired: 2, why: 'publicar exige haber aprobado el render' },
  { fragment: '/stages/shorts', gatesRequired: 2, why: 'los Shorts salen del video aprobado' },
];

/**
 * Minimo numero de gates en algun camino disparador -> nodo.
 *
 * Es un Dijkstra con peso 1 en los nodos de aprobacion y 0 en el resto, hecho
 * a mano porque el grafo tiene diez nodos.
 */
function minGatesTo(workflow) {
  const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
  const triggers = workflow.nodes.filter((node) => /trigger/i.test(node.type));

  const best = new Map();
  const queue = [];

  for (const trigger of triggers) {
    best.set(trigger.name, 0);
    queue.push(trigger.name);
  }

  while (queue.length > 0) {
    const name = queue.shift();
    const current = best.get(name) ?? Infinity;
    const node = byName.get(name);

    // Atravesar un nodo de aprobacion suma uno al coste del camino.
    const cost = node && node.type === WAIT_TYPE ? current + 1 : current;

    for (const branch of workflow.connections[name]?.main ?? []) {
      for (const link of branch ?? []) {
        if (cost < (best.get(link.node) ?? Infinity)) {
          best.set(link.node, cost);
          queue.push(link.node);
        }
      }
    }
  }

  return best;
}

let failures = 0;

for (const file of readdirSync(WORKFLOW_DIR).filter((name) => name.endsWith('.json'))) {
  const workflow = JSON.parse(readFileSync(join(WORKFLOW_DIR, file), 'utf8'));
  const gates = workflow.nodes.filter((node) => node.type === WAIT_TYPE);
  const reach = minGatesTo(workflow);

  console.log(`\n${file}`);
  console.log(`  nodos: ${workflow.nodes.length}   gates humanos: ${gates.length}`);

  let touchesGated = false;

  for (const node of workflow.nodes) {
    const serialized = JSON.stringify(node.parameters ?? {});

    for (const { fragment, gatesRequired, why } of GATED) {
      if (!serialized.includes(fragment)) continue;
      touchesGated = true;

      const crossed = reach.get(node.name);

      if (crossed === undefined) {
        // Inalcanzable desde un disparador: es un nodo huerfano, no un riesgo.
        console.log(`  aviso: "${node.name}" no cuelga de ningun disparador.`);
        continue;
      }

      if (crossed < gatesRequired) {
        console.log(
          `  FALLO: "${node.name}" llama a ${fragment} cruzando solo ${crossed} ` +
            `aprobacion(es); necesita ${gatesRequired}.`,
        );
        console.log(`         ${why}`);
        failures++;
      } else {
        console.log(`  OK: ${fragment} cruza ${crossed} aprobacion(es).`);
      }
    }
  }

  if (touchesGated && gates.length === 0) {
    console.log('  FALLO: usa etapas protegidas y no tiene ningun nodo de aprobacion.');
    failures++;
  }
  if (!touchesGated) console.log('  (no toca etapas protegidas)');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} problema(s) de aprobacion. Revisa las aristas del grafo.`);
  process.exit(1);
}
console.log('Todos los workflows respetan los gates humanos.');
