import { z } from 'zod';
import type { ComponentType } from 'react';
import { NetworkDiagram, networkDiagramSchema } from '../components/NetworkDiagram';
import { CodeBlock, codeBlockSchema } from '../components/CodeBlock';
import { Timeline, timelineSchema } from '../components/Timeline';
import { SideBySide, sideBySideSchema } from '../components/SideBySide';
import { Counter, counterSchema } from '../components/Counter';
import { TitleCard, titleCardSchema } from '../components/TitleCard';

/**
 * REGISTRO DE ESCENAS
 *
 * Es la unica fuente de verdad sobre que puede dibujar el canal.
 *
 * La etapa de storyboard valida cada marca `[ESCENA: ...]` del guion contra
 * este registro. Si el guion pide una escena que no esta aqui, la etapa falla
 * y reporta que componente falta. No hay fallback generico a proposito: un
 * fallback silencioso produce videos mediocres que nadie revisa.
 *
 * Anadir una escena = escribir el componente, exportar su schema, registrarlo
 * aqui. Tres pasos, ninguno opcional.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyScene = { schema: z.ZodType<any>; component: ComponentType<any>; description: string };

export const SCENE_REGISTRY = {
  titleCard: {
    schema: titleCardSchema,
    component: TitleCard,
    description: 'Portada o separador de capitulo. Titulo grande y subtitulo.',
  },
  networkDiagram: {
    schema: networkDiagramSchema,
    component: NetworkDiagram,
    description:
      'Nodos conectados con paquetes viajando entre ellos. Para handshakes, ' +
      'peticiones, replicacion, cualquier cosa que se mueva por una red.',
  },
  codeBlock: {
    schema: codeBlockSchema,
    component: CodeBlock,
    description: 'Bloque de codigo con lineas que se resaltan progresivamente.',
  },
  timeline: {
    schema: timelineSchema,
    component: Timeline,
    description: 'Secuencia de eventos en el tiempo. Para protocolos y cronologias.',
  },
  sideBySide: {
    schema: sideBySideSchema,
    component: SideBySide,
    description: 'Comparativa de dos enfoques o dos estados, uno frente a otro.',
  },
  counter: {
    schema: counterSchema,
    component: Counter,
    description: 'Numero grande que sube o baja. Para latencias, throughput, escala.',
  },
} as const satisfies Record<string, AnyScene>;

export type SceneKind = keyof typeof SCENE_REGISTRY;

export const SCENE_KINDS = Object.keys(SCENE_REGISTRY) as SceneKind[];

export function isKnownScene(kind: string): kind is SceneKind {
  return kind in SCENE_REGISTRY;
}

/**
 * Separa una lista de marcas de escena en conocidas y desconocidas.
 * La etapa de storyboard llama a esto y falla si `unknown` no esta vacio.
 */
export function partitionSceneKinds(kinds: readonly string[]): {
  known: SceneKind[];
  unknown: string[];
} {
  const known: SceneKind[] = [];
  const unknown: string[] = [];

  for (const kind of kinds) {
    if (isKnownScene(kind)) known.push(kind);
    else unknown.push(kind);
  }

  return { known, unknown: [...new Set(unknown)] };
}

/** Catalogo legible que se inyecta en el prompt de storyboard. */
export function describeSceneCatalog(): string {
  return SCENE_KINDS.map((kind) => `- ${kind}: ${SCENE_REGISTRY[kind].description}`).join('\n');
}
