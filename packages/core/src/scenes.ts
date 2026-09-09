/**
 * CATALOGO DE ESCENAS — fuente unica de verdad
 *
 * Datos puros, sin React, para que lo consuman los dos lados:
 *
 *   - El paquete `video` mapea cada `kind` a su componente de Remotion.
 *   - Las etapas de guion y storyboard inyectan estas descripciones en los
 *     prompts, para que el modelo sepa que puede pedir.
 *
 * Si esta lista viviera solo en el lado de React, el generador de guion
 * tendria que llevar una copia y las dos se separarian a la primera escena
 * nueva. Un guion que pide componentes que no existen es exactamente el
 * fallo que este diseño evita.
 */

export interface SceneCatalogEntry {
  kind: string;
  /** Que dibuja. Se inyecta literal en el prompt. */
  description: string;
  /** Cuando conviene usarla. Ayuda al modelo a no forzar la escena mas parecida. */
  useWhen: string;
}

export const SCENE_CATALOG = [
  {
    kind: 'titleCard',
    description: 'Portada o separador de capitulo. Titulo grande y subtitulo opcional.',
    useWhen: 'Apertura del video y transiciones entre bloques grandes.',
  },
  {
    kind: 'networkDiagram',
    description:
      'Nodos conectados con paquetes viajando entre ellos. Los paquetes pueden perderse ' +
      'a mitad de camino. Admite un guia (el personaje) que recorre el diagrama y señala.',
    useWhen:
      'Cualquier cosa que se mueva entre maquinas: handshakes, peticiones, replicacion, ' +
      'consenso, reintentos, timeouts.',
  },
  {
    kind: 'codeBlock',
    description: 'Bloque de codigo con lineas que se resaltan progresivamente y una nota por foco.',
    useWhen:
      'Cuando el mecanismo se ve mejor en el codigo o el protocolo literal que en un diagrama.',
  },
  {
    kind: 'timeline',
    description: 'Secuencia de eventos en el tiempo, con etiqueta y detalle por evento.',
    useWhen: 'Protocolos por pasos, cronologias, desglose de latencia.',
  },
  {
    kind: 'sideBySide',
    description: 'Dos paneles enfrentados, cada uno con titulo y lista de puntos.',
    useWhen: 'Comparar dos enfoques, el antes y el despues, o lo ingenuo frente a lo correcto.',
  },
  {
    kind: 'counter',
    description: 'Numero grande que cuenta hasta su valor, con unidad y nota al pie.',
    useWhen: 'Rematar con una cifra: latencias, escala, throughput, porcentajes.',
  },
] as const satisfies readonly SceneCatalogEntry[];

export type SceneKind = (typeof SCENE_CATALOG)[number]['kind'];

export const SCENE_KINDS: readonly string[] = SCENE_CATALOG.map((entry) => entry.kind);

export function isKnownSceneKind(kind: string): boolean {
  return SCENE_KINDS.includes(kind);
}

/** Catalogo legible que se inyecta en los prompts de guion y storyboard. */
export function describeSceneCatalog(): string {
  return SCENE_CATALOG.map(
    (entry) => `- ${entry.kind}\n    Dibuja: ${entry.description}\n    Usar cuando: ${entry.useWhen}`,
  ).join('\n');
}
