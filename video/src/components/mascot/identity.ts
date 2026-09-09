/**
 * OKI — IDENTIDAD DEL PERSONAJE DEL CANAL
 *
 * ================================================================
 *  ESTE ARCHIVO ESTA CONGELADO.
 *
 *  La geometria y los colores de aqui definen la cara del canal.
 *  Un espectador que vea el video 40 tiene que reconocer al mismo
 *  personaje que vio en el video 1. Cambiar un radio o un color
 *  rompe esa continuidad de forma silenciosa: cada video seguira
 *  siendo coherente consigo mismo y nadie notara el fallo hasta
 *  que alguien vea dos videos seguidos.
 *
 *  Si algun dia hay que rediseñarlo, se hace a proposito, de una
 *  vez, y se documenta aqui con la fecha y el motivo.
 * ================================================================
 *
 * Decisiones de diseño y por que:
 *
 * - LAS EXPRESIONES LAS LLEVAN LOS OJOS, no una boca articulada.
 *   Una boca que cambia con cada estado multiplica las combinaciones
 *   que hay que mantener coherentes y empuja el personaje hacia lo
 *   infantil. Con los ojos y la inclinacion de la cabeza sobran
 *   expresiones. Es la via de EVE, Slack o Notion.
 *
 * - LA SONRISA ES FIJA Y ES PARTE DE LA CARCASA, no del estado. Nacio
 *   como una luz de contorno para despegar la silueta del fondo oscuro
 *   y resulto leerse como boca; se conservo porque aporta la calidez
 *   que le faltaba. Al ser constante no añade estados que mantener:
 *   Oki siempre tiene el mismo gesto de base y son los ojos los que
 *   cambian. Eso es justamente lo que lo hace reconocible.
 *
 * - CABEZA MAS REDONDA ABAJO QUE ARRIBA. Un cuadrado redondeado
 *   uniforme es generico y se olvida. Los radios asimetricos le dan
 *   silueta propia sin recurrir a nada extravagante.
 *
 * - ANTENA LIGERAMENTE DESCENTRADA E INCLINADA. Un unico rasgo
 *   asimetrico. Es lo que hace que la silueta sea identificable en
 *   una miniatura de 120px y lo que le da sensacion de estar vivo.
 *
 * - MANOS FLOTANTES, SIN BRAZOS. No estan unidas al cuerpo, como en EVE o
 *   Rayman. Dos razones: un brazo articulado obliga a resolver cinematica
 *   inversa para que el codo caiga bien en cada gesto, y ademas rompe la
 *   silueta limpia que hace a Oki reconocible en miniatura. Flotando, la
 *   mano va donde haga falta y el personaje sigue leyendose de un vistazo.
 *
 * - SIN RELLENOS SATURADOS. El personaje vive sobre el mismo fondo
 *   oscuro que el resto del canal y usa el mismo azul de acento. No
 *   compite con los diagramas: los acompaña.
 */

import { theme } from '../../theme';

/** Lienzo del personaje. Todas las coordenadas van referidas a esto. */
export const OKI_VIEWBOX = { width: 200, height: 210 } as const;

export const OKI_GEOMETRY = {
  head: {
    x: 20,
    y: 46,
    width: 160,
    height: 142,
    /** Arriba mas recto, abajo mas redondo. Es la firma de la silueta. */
    radiusTop: 44,
    radiusBottom: 62,
    strokeWidth: 3.5,
  },
  eye: {
    /** Centros de los ojos. */
    leftX: 72,
    rightX: 128,
    centerY: 116,
    width: 19,
    height: 27,
    radius: 9.5,
  },
  hand: {
    radius: 17,
    /** Posicion en reposo, a los lados del cuerpo. */
    restLeftX: 4,
    restRightX: 196,
    restY: 152,
    /** Centro desde el que se mide el gesto de señalar. */
    pivotX: 100,
    pivotY: 120,
    /** Distancia a la que se aleja la mano al señalar. */
    pointRadius: 104,
  },
  antenna: {
    /** Descentrada a la izquierda a proposito. */
    baseX: 88,
    baseY: 48,
    tipX: 74,
    tipY: 12,
    /** Punto de control de la curva: le da el codo. */
    controlX: 92,
    controlY: 22,
    strokeWidth: 5,
    tipRadius: 9,
  },
} as const;

export const OKI_COLORS = {
  /**
   * La carcasa es deliberadamente MAS clara que las tarjetas del canal.
   * Oki tiene que despegarse del fondo: es el unico elemento que aparece en
   * todos los videos, y si su silueta no se lee de un vistazo no cumple su
   * funcion de ser reconocible.
   */
  shell: '#1D2531',
  shellHighlight: '#2A3545',
  outline: '#4A5B78',
  eye: theme.color.accent,
  antenna: theme.color.accent,
  /** Solo para el estado de error o alerta. Se usa muy poco. */
  alert: theme.color.warn,
} as const;

/**
 * Expresiones. Conjunto CERRADO a proposito: si una escena necesita
 * un estado nuevo, se añade aqui y pasa a estar disponible en todo el
 * canal, en vez de improvisarse en una escena suelta.
 */
export const OKI_EXPRESSIONS = [
  /** Reposo. El estado por defecto en el 80% del metraje. */
  'neutral',
  /** Cabeza inclinada, un ojo mas abierto. Para preguntas. */
  'curious',
  /** Ojos arriba, antena latiendo. Mientras se explica algo complejo. */
  'thinking',
  /** Ojos grandes y redondos. Para el dato contraintuitivo. */
  'surprised',
  /** Ojos en arco hacia arriba. Para confirmaciones y cierres. */
  'happy',
  /** Ojos estrechos. Cuando se mira un detalle de cerca. */
  'focused',
] as const;

export type OkiExpression = (typeof OKI_EXPRESSIONS)[number];

/**
 * Ritmo del parpadeo, en frames a 30fps.
 *
 * Un parpadeo regular como un metronomo delata que es una animacion.
 * El intervalo se sortea entre estos limites con una secuencia
 * determinista, para que el render sea reproducible.
 */
export const OKI_BLINK = {
  minIntervalFrames: 70,
  maxIntervalFrames: 145,
  durationFrames: 7,
  /** De vez en cuando parpadea dos veces seguidas. Muy humano. */
  doubleBlinkChance: 0.22,
} as const;
