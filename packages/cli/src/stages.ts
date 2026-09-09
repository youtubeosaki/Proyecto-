import { STAGE_ORDER, type Stage } from '@osaki/core';

/**
 * Registro de etapas de la CLI.
 *
 * Cada etapa se ejecuta de forma aislada:  osaki run <etapa> --video <id>
 * Eso es lo que permite depurar la etapa 6 sin repetir la 1.
 *
 * Las etapas todavia no implementadas declaran `implemented: false` y fallan
 * con un mensaje que dice en que fase llegan. Prefiero eso a un stub que
 * devuelve datos vacios y parece que funciona.
 */

export interface StageDefinition {
  stage: Stage;
  summary: string;
  /** Etapa cuyo artefacto necesita para arrancar. */
  requires?: Stage;
  implemented: boolean;
  /** Fase del plan en la que se construye. */
  phase: 1 | 2 | 3 | 4 | 5;
  /** Si es true, el pipeline se detiene aqui hasta que un humano decida. */
  humanGate?: boolean;
}

export const STAGES: Record<Stage, StageDefinition> = {
  ideas: {
    stage: 'ideas',
    summary: 'Ingesta RSS + Hacker News, deduplica y puntua ideas.',
    implemented: false,
    phase: 2,
  },
  research: {
    stage: 'research',
    summary: 'Investiga el tema y produce un documento de hechos con fuentes primarias.',
    requires: 'ideas',
    implemented: false,
    phase: 2,
  },
  angles: {
    stage: 'angles',
    summary: 'Propone 3 angulos y estructuras. APROBACION HUMANA #1.',
    requires: 'research',
    implemented: false,
    phase: 2,
    humanGate: true,
  },
  script: {
    stage: 'script',
    summary: 'Escribe el guion con marcas [ESCENA: ...] a partir del angulo elegido.',
    requires: 'angles',
    implemented: false,
    phase: 2,
  },
  storyboard: {
    stage: 'storyboard',
    summary: 'Traduce las marcas de escena a una composicion de Remotion.',
    requires: 'script',
    implemented: false,
    phase: 3,
  },
  audio: {
    stage: 'audio',
    summary: 'Genera o ingiere la narracion y ajusta el timing al audio real.',
    requires: 'storyboard',
    implemented: false,
    phase: 3,
  },
  render: {
    stage: 'render',
    summary: 'Renderiza con Remotion y mezcla con ffmpeg. APROBACION HUMANA #2.',
    requires: 'audio',
    implemented: false,
    phase: 3,
    humanGate: true,
  },
  packaging: {
    stage: 'packaging',
    summary: '5 titulos, 3 miniaturas, descripcion con capitulos y fuentes, tags.',
    requires: 'render',
    implemented: false,
    phase: 3,
  },
  shorts: {
    stage: 'shorts',
    summary: 'Detecta segmentos con mas gancho y genera cortes verticales.',
    requires: 'render',
    implemented: false,
    phase: 5,
  },
  publish: {
    stage: 'publish',
    summary: 'Sube a YouTube en privado. Exige aprobacion humana #2 registrada.',
    requires: 'packaging',
    implemented: false,
    phase: 5,
  },
  analytics: {
    stage: 'analytics',
    summary: 'A los 7 dias, lee Analytics y realimenta el scoring de ideas.',
    requires: 'publish',
    implemented: false,
    phase: 5,
  },
};

export const STAGE_LIST: StageDefinition[] = STAGE_ORDER.map((stage) => STAGES[stage]);
