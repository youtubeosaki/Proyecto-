import type React from 'react';
import { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../../theme';
import { breathe, oscillate, popIn, progressBetween } from '../../theme/motion';
import {
  OKI_BLINK,
  OKI_COLORS,
  OKI_EXPRESSIONS,
  OKI_GEOMETRY,
  OKI_VIEWBOX,
  type OkiExpression,
} from './identity';

/**
 * OKI, el personaje del canal.
 *
 * Se dibuja por completo desde codigo. Eso no es capricho: un PNG se
 * degrada al escalar, no se puede animar por partes y, sobre todo, no
 * garantiza que dentro de dos años siga siendo exactamente el mismo. Un
 * componente parametrico con su geometria congelada en `identity.ts` si.
 *
 * Ademas sale gratis en los Shorts verticales y en las miniaturas: es el
 * mismo componente a otra escala.
 */

export const okiSchema = z.object({
  expression: z.enum(OKI_EXPRESSIONS).default('neutral'),
  /** Hacia donde mira, -1 (izquierda) a 1 (derecha). */
  gazeX: z.number().min(-1).max(1).default(0),
  gazeY: z.number().min(-1).max(1).default(0),
  /** Frame en el que entra en escena. */
  startFrame: z.number().int().nonnegative().default(0),
  /** Desfasa el parpadeo y la respiracion entre apariciones. */
  seed: z.number().int().nonnegative().default(1),
  /** Alto en pixeles. El ancho sale de la relacion del lienzo. */
  size: z.number().positive().default(220),
  /** Que hacen las manos. */
  handPose: z.enum(['idle', 'point', 'wave', 'present']).default('idle'),
  /**
   * Hacia donde señala, en grados. 0 es a la derecha y crece en el sentido
   * de las agujas del reloj, como el eje Y de SVG. Solo se usa con
   * handPose = 'point'.
   */
  pointAngle: z.number().default(0),
});

/**
 * `z.input` y no `z.infer`: los campos con `.default()` salen obligatorios en
 * el tipo de salida del schema, que es lo correcto para los datos ya
 * validados pero no para las props que escribe una escena a mano.
 */
export type OkiProps = z.input<typeof okiSchema>;

/* --------------------------------------------------------------------------
 * Parpadeo determinista
 *
 * Remotion renderiza frames en paralelo en varios procesos. Cualquier
 * aleatoriedad tiene que ser funcion pura del frame, no estado acumulado, o
 * el mismo frame saldria distinto segun quien lo renderice.
 * ----------------------------------------------------------------------- */

/** Congruencial lineal. Basta para esto y es reproducible en cualquier maquina. */
function makeRandom(seed: number): () => number {
  let state = (seed * 1_664_525 + 1_013_904_223) >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function buildBlinkSchedule(seed: number, totalFrames: number): number[] {
  const random = makeRandom(seed + 7);
  const times: number[] = [];
  let cursor = 25 + random() * 40;

  while (cursor < totalFrames) {
    times.push(Math.round(cursor));

    // Un doble parpadeo ocasional es lo que separa "vivo" de "temporizado".
    if (random() < OKI_BLINK.doubleBlinkChance) {
      cursor += OKI_BLINK.durationFrames + 5;
      if (cursor < totalFrames) times.push(Math.round(cursor));
    }

    cursor +=
      OKI_BLINK.minIntervalFrames +
      random() * (OKI_BLINK.maxIntervalFrames - OKI_BLINK.minIntervalFrames);
  }

  return times;
}

/** 0 = ojo abierto, 1 = completamente cerrado. */
function blinkAmount(frame: number, schedule: readonly number[]): number {
  for (const at of schedule) {
    if (frame < at - 1) break;
    const t = (frame - at) / OKI_BLINK.durationFrames;
    if (t >= 0 && t <= 1) return Math.sin(t * Math.PI);
  }
  return 0;
}

/* --------------------------------------------------------------------------
 * Expresiones
 *
 * Cada expresion es una deformacion de la misma geometria base. Nunca una
 * forma nueva: asi es imposible que dos expresiones parezcan personajes
 * distintos.
 * ----------------------------------------------------------------------- */

interface EyeShape {
  scaleX: number;
  scaleY: number;
  /** Desplazamiento vertical respecto al centro base. */
  offsetY: number;
  /** Curva el ojo hacia arriba, como en una sonrisa. 0..1 */
  arc: number;
  headTilt: number;
}

function eyeShapeFor(expression: OkiExpression): EyeShape {
  switch (expression) {
    case 'curious':
      return { scaleX: 1, scaleY: 1.12, offsetY: -2, arc: 0, headTilt: -6 };
    case 'thinking':
      return { scaleX: 0.95, scaleY: 0.55, offsetY: -8, arc: 0, headTilt: 4 };
    case 'surprised':
      return { scaleX: 1.35, scaleY: 1.35, offsetY: -1, arc: 0, headTilt: 0 };
    case 'happy':
      return { scaleX: 1.15, scaleY: 0.7, offsetY: 2, arc: 1, headTilt: -2 };
    case 'focused':
      return { scaleX: 1.1, scaleY: 0.42, offsetY: 0, arc: 0, headTilt: 0 };
    case 'neutral':
    default:
      return { scaleX: 1, scaleY: 1, offsetY: 0, arc: 0, headTilt: 0 };
  }
}

/* --------------------------------------------------------------------------
 * Manos
 * ----------------------------------------------------------------------- */

export interface Point {
  x: number;
  y: number;
}

/**
 * Posicion de la mano que señala, en coordenadas del lienzo.
 *
 * Se exporta porque el escenario la necesita para que el haz de señalado
 * salga de la mano y no del costado del cuerpo. Si cada uno calculase la
 * posicion por su cuenta, el haz acabaria naciendo a unos pixeles de la mano
 * y se notaria.
 */
export function pointingHandAt(angleDeg: number): Point {
  const { pivotX, pivotY, pointRadius } = OKI_GEOMETRY.hand;
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: pivotX + Math.cos(radians) * pointRadius,
    y: pivotY + Math.sin(radians) * pointRadius,
  };
}

/** Cuanto sobresale la punta del indice mas alla del centro de la palma. */
const FINGERTIP_REACH = 2.5;

/**
 * Punta del dedo indice, en coordenadas del lienzo.
 *
 * El haz de señalado tiene que nacer AQUI y no en el centro de la palma: si
 * sale de la palma, atraviesa el propio dedo y el gesto deja de leerse como
 * señalar.
 */
export function pointingFingertipAt(angleDeg: number): Point {
  const hand = pointingHandAt(angleDeg);
  const radians = (angleDeg * Math.PI) / 180;
  const reach = OKI_GEOMETRY.hand.radius * FINGERTIP_REACH;
  return {
    x: hand.x + Math.cos(radians) * reach,
    y: hand.y + Math.sin(radians) * reach,
  };
}

type HandPose = 'idle' | 'point' | 'wave' | 'present';

/**
 * Mano con dedos.
 *
 * Se dibuja en coordenadas locales con los dedos apuntando a +X, y luego se
 * rota entera al angulo que toque. Asi el gesto se define una sola vez y
 * sirve para cualquier direccion, en vez de tener una variante por lado.
 *
 * Los dedos son trazos con extremos redondeados, no siluetas rellenas. A la
 * escala a la que se ve la mano en pantalla, una silueta con contorno se
 * emborrona; un trazo grueso se lee limpio.
 */
const Hand: React.FC<{
  x: number;
  y: number;
  radius: number;
  pose: HandPose;
  /** Grados. 0 = dedos hacia la derecha. */
  angleDeg: number;
}> = ({ x, y, radius: r, pose, angleDeg }) => {
  const skin = '#37455C';
  const edge = OKI_COLORS.outline;

  /** Un dedo: trazo con capa de contorno debajo para que despegue del fondo. */
  const finger = (
    key: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
  ) => (
    <g key={key}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={edge}
        strokeWidth={width + 3}
        strokeLinecap="round"
      />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={skin} strokeWidth={width} strokeLinecap="round" />
    </g>
  );

  const fingers: React.ReactNode[] = [];

  if (pose === 'point') {
    // Indice extendido. Es el gesto que tiene que leerse a la primera, asi
    // que es claramente mas largo que el resto de la mano.
    fingers.push(finger('index', r * 0.2, -r * 0.12, r * 2.25, -r * 0.12, r * 0.62));
    // Pulgar levantado, que es lo que hace que el resto se lea como puño.
    fingers.push(finger('thumb', -r * 0.1, -r * 0.35, -r * 0.35, -r * 1.15, r * 0.5));
  } else if (pose === 'present' || pose === 'wave') {
    // Cuatro dedos abiertos en abanico.
    [-38, -13, 13, 38].forEach((deg, index) => {
      const radians = (deg * Math.PI) / 180;
      fingers.push(
        finger(
          `open${index}`,
          Math.cos(radians) * r * 0.45,
          Math.sin(radians) * r * 0.45,
          Math.cos(radians) * r * 1.95,
          Math.sin(radians) * r * 1.95,
          r * 0.5,
        ),
      );
    });
    fingers.push(finger('thumb', -r * 0.2, -r * 0.4, -r * 0.55, -r * 1.2, r * 0.48));
  } else {
    // Reposo: mano relajada, dedos cortos y juntos. No es un puño cerrado
    // (leeria como enfado) ni una mano abierta (leeria como saludo).
    [-0.5, 0, 0.5].forEach((offset, index) => {
      fingers.push(
        finger(
          `rest${index}`,
          r * 0.45,
          offset * r * 0.62,
          r * 1.25,
          offset * r * 0.78,
          r * 0.46,
        ),
      );
    });
    fingers.push(finger('thumb', -r * 0.15, -r * 0.35, -r * 0.45, -r * 0.95, r * 0.44));
  }

  return (
    <g transform={`translate(${x} ${y}) rotate(${angleDeg})`}>
      {/* Halo tenue: separa la mano del fondo cuando se aleja del cuerpo. */}
      <circle cx={0} cy={0} r={r * 1.5} fill={OKI_COLORS.antenna} opacity={0.08} />

      {/* Dedos debajo de la palma para que nazcan de ella. */}
      {fingers}

      <circle cx={0} cy={0} r={r * 0.92} fill={skin} stroke={edge} strokeWidth={3} />
      {/* Reflejo: sin el, la palma se lee como un agujero en vez de volumen. */}
      <circle cx={-r * 0.26} cy={-r * 0.28} r={r * 0.26} fill="#FFFFFF" opacity={0.2} />
    </g>
  );
};

/* --------------------------------------------------------------------------
 * Piezas
 * ----------------------------------------------------------------------- */

/** Path de la cabeza, con los radios de arriba distintos de los de abajo. */
function headPath(): string {
  const { x, y, width: w, height: h, radiusTop: rt, radiusBottom: rb } = OKI_GEOMETRY.head;
  const right = x + w;
  const bottom = y + h;

  return [
    `M ${x + rt} ${y}`,
    `H ${right - rt}`,
    `Q ${right} ${y} ${right} ${y + rt}`,
    `V ${bottom - rb}`,
    `Q ${right} ${bottom} ${right - rb} ${bottom}`,
    `H ${x + rb}`,
    `Q ${x} ${bottom} ${x} ${bottom - rb}`,
    `V ${y + rt}`,
    `Q ${x} ${y} ${x + rt} ${y}`,
    'Z',
  ].join(' ');
}

const Eye: React.FC<{
  cx: number;
  cy: number;
  shape: EyeShape;
  blink: number;
  gazeX: number;
  gazeY: number;
}> = ({ cx, cy, shape, blink, gazeX, gazeY }) => {
  const { width, height, radius } = OKI_GEOMETRY.eye;

  // El parpadeo aplasta el ojo contra su propio centro.
  const openness = 1 - blink;
  const w = width * shape.scaleX;
  const h = Math.max(3.2, height * shape.scaleY * openness);

  // La mirada mueve el ojo dentro de la cara, no la cara entera.
  const x = cx + gazeX * 7;
  const y = cy + shape.offsetY + gazeY * 5;

  if (shape.arc > 0 && blink < 0.5) {
    // Ojo en arco: un trazo curvado hacia arriba. Es la unica forma que no
    // es una capsula, y solo aparece en 'happy'.
    // Arco claramente hacia arriba. Una curva poco pronunciada se lee como
    // ojo cerrado o incluso como gesto triste, que es lo contrario.
    const half = w / 2 + 3;
    const path = `M ${x - half} ${y + 7} Q ${x} ${y - 17} ${x + half} ${y + 7}`;
    return (
      <g>
        <path
          d={path}
          fill="none"
          stroke={OKI_COLORS.eye}
          strokeWidth={16}
          strokeLinecap="round"
          opacity={0.16}
        />
        <path
          d={path}
          fill="none"
          stroke={OKI_COLORS.eye}
          strokeWidth={7.5}
          strokeLinecap="round"
        />
      </g>
    );
  }

  return (
    <g>
      {/* Halo. Dos capas de opacidad baja en vez de un filtro de desenfoque:
          mismo resultado a una fraccion del coste de render. */}
      <rect
        x={x - w / 2 - 6}
        y={y - h / 2 - 6}
        width={w + 12}
        height={h + 12}
        rx={radius + 6}
        fill={OKI_COLORS.eye}
        opacity={0.16 * openness}
      />
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={Math.min(radius, h / 2)}
        fill={OKI_COLORS.eye}
      />
      {/* Brillo especular. Sin el, el ojo se lee como un boton apagado. */}
      {openness > 0.55 ? (
        <circle cx={x - w * 0.2} cy={y - h * 0.24} r={w * 0.16} fill="#FFFFFF" opacity={0.5} />
      ) : null}
    </g>
  );
};

/* --------------------------------------------------------------------------
 * Personaje
 * ----------------------------------------------------------------------- */

export const Oki: React.FC<OkiProps> = ({
  expression = 'neutral',
  gazeX = 0,
  gazeY = 0,
  startFrame = 0,
  seed = 1,
  size = 220,
  handPose = 'idle',
  pointAngle = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const blinkSchedule = useMemo(
    () => buildBlinkSchedule(seed, durationInFrames + 120),
    [seed, durationInFrames],
  );

  const shape = eyeShapeFor(expression);
  const blink = blinkAmount(frame, blinkSchedule);
  const entrance = popIn(frame, startFrame, fps);

  // Respiracion y flotacion. Fase derivada de la semilla para que dos Okis
  // en pantalla no respiren al unisono.
  const phase = seed * 1.37;
  const bodyScale = breathe(frame, 168, 0.014, phase);
  const float = oscillate(frame, 214, phase) * 4;

  // Deriva de la mirada: aunque la escena pida gaze fijo, el ojo vaga un poco.
  const wanderX = oscillate(frame, 260, phase * 2) * 0.18;
  const wanderY = oscillate(frame, 310, phase * 3) * 0.12;

  // La cabeza se inclina segun la expresion, con un balanceo lento encima.
  const tilt = shape.headTilt + oscillate(frame, 340, phase) * 1.6;

  // La antena late siempre; en 'thinking' late mas fuerte porque es el estado
  // que representa trabajo interno.
  const antennaBeat = expression === 'thinking' ? 74 : 150;
  const antennaGlow = 0.55 + (oscillate(frame, antennaBeat, phase) * 0.5 + 0.5) * 0.45;
  const antennaSway = oscillate(frame, 190, phase * 1.5) * 3;

  /**
   * Manos. En reposo flotan a los lados y suben y bajan con desfase entre
   * ellas; si respiraran a la vez pareceria un solo objeto partido en dos.
   */
  const { hand } = OKI_GEOMETRY;
  const handBobLeft = oscillate(frame, 176, phase) * 5;
  const handBobRight = oscillate(frame, 176, phase + Math.PI * 0.7) * 5;

  // Anotado: la geometria es `as const`, asi que sin esto las coordenadas
  // quedarian como tipos literales y no admitirian el gesto.
  const restLeft: Point = { x: hand.restLeftX, y: hand.restY + handBobLeft };
  const restRight: Point = { x: hand.restRightX, y: hand.restY + handBobRight };

  let leftHand: Point = restLeft;
  let rightHand: Point = restRight;

  /**
   * Pose y orientacion de cada mano por separado.
   *
   * Al señalar solo gesticula la mano del lado al que apunta; la otra se
   * queda en reposo. Que las dos señalaran a la vez leeria como un robot
   * haciendo una demostracion, no como alguien indicando algo.
   */
  let leftPose: HandPose = 'idle';
  let rightPose: HandPose = 'idle';
  // En reposo los dedos apuntan hacia fuera y algo hacia abajo.
  let leftAngle = 160;
  let rightAngle = 20;

  if (handPose === 'point') {
    const target = pointingHandAt(pointAngle);
    if (target.x >= hand.pivotX) {
      rightHand = target;
      rightPose = 'point';
      rightAngle = pointAngle;
    } else {
      leftHand = target;
      leftPose = 'point';
      leftAngle = pointAngle;
    }
  } else if (handPose === 'wave') {
    // Saludo: la mano derecha sube y oscila.
    const swing = oscillate(frame, 26, phase) * 26;
    rightHand = { x: hand.restRightX + 6 + swing * 0.5, y: hand.restY - 62 + Math.abs(swing) * 0.2 };
    rightPose = 'wave';
    // La mano bascula con el saludo: sin eso solo se traslada, y se lee como
    // una mano que flota, no como alguien saludando.
    rightAngle = -70 + swing * 0.9;
  } else if (handPose === 'present') {
    // Presentar: ambas manos abiertas hacia delante, como sosteniendo algo.
    leftHand = { x: hand.restLeftX + 22, y: hand.restY + 14 + handBobLeft };
    rightHand = { x: hand.restRightX - 22, y: hand.restY + 14 + handBobRight };
    leftPose = 'present';
    rightPose = 'present';
    // Palmas hacia arriba, como sosteniendo lo que se presenta.
    leftAngle = -125;
    rightAngle = -55;
  }

  const { head, eye, antenna } = OKI_GEOMETRY;
  const pivotX = OKI_VIEWBOX.width / 2;
  const pivotY = head.y + head.height;

  const width = size * (OKI_VIEWBOX.width / OKI_VIEWBOX.height);

  return (
    <svg
      width={width}
      height={size}
      viewBox={`0 0 ${OKI_VIEWBOX.width} ${OKI_VIEWBOX.height}`}
      style={{
        overflow: 'visible',
        opacity: entrance.opacity,
        transform: `translateY(${float.toFixed(2)}px) scale(${(entrance.scale * bodyScale).toFixed(4)})`,
        filter: entrance.blur > 0.15 ? `blur(${entrance.blur.toFixed(2)}px)` : undefined,
      }}
    >
      <defs>
        <linearGradient id={`oki-shell-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={OKI_COLORS.shellHighlight} />
          <stop offset="100%" stopColor={OKI_COLORS.shell} />
        </linearGradient>
      </defs>

      <g transform={`rotate(${tilt.toFixed(2)} ${pivotX} ${pivotY})`}>
        {/* Antena. Se dibuja antes que la cabeza para que nazca por detras. */}
        <g transform={`rotate(${antennaSway.toFixed(2)} ${antenna.baseX} ${antenna.baseY})`}>
          <path
            d={`M ${antenna.baseX} ${antenna.baseY} Q ${antenna.controlX} ${antenna.controlY} ${antenna.tipX} ${antenna.tipY}`}
            fill="none"
            stroke={OKI_COLORS.outline}
            strokeWidth={antenna.strokeWidth}
            strokeLinecap="round"
          />
          <circle
            cx={antenna.tipX}
            cy={antenna.tipY}
            r={antenna.tipRadius * 2.4}
            fill={OKI_COLORS.antenna}
            opacity={0.12 * antennaGlow}
          />
          <circle
            cx={antenna.tipX}
            cy={antenna.tipY}
            r={antenna.tipRadius * 1.5}
            fill={OKI_COLORS.antenna}
            opacity={0.24 * antennaGlow}
          />
          <circle
            cx={antenna.tipX}
            cy={antenna.tipY}
            r={antenna.tipRadius}
            fill={OKI_COLORS.antenna}
            opacity={antennaGlow}
          />
        </g>

        {/* Sombra de contacto. Ancla al personaje en el plano. */}
        <ellipse
          cx={pivotX}
          cy={pivotY + 12}
          rx={head.width * 0.38}
          ry={9}
          fill="#000000"
          opacity={0.28}
        />

        {/* Cabeza. */}
        <path
          d={headPath()}
          fill={`url(#oki-shell-${seed})`}
          stroke={OKI_COLORS.outline}
          strokeWidth={head.strokeWidth}
        />

        {/* Luz de contorno en el borde inferior. Es lo que despega la silueta
            del fondo sin tener que subir el brillo de toda la carcasa. */}
        <path
          d={`M ${head.x + 14} ${head.y + head.height - 46} Q ${head.x + head.width / 2} ${head.y + head.height + 6} ${head.x + head.width - 14} ${head.y + head.height - 46}`}
          fill="none"
          stroke={theme.color.accent}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.22}
        />

        {/* Reflejo superior: le da volumen sin dibujar volumen. */}
        <path
          d={`M ${head.x + 26} ${head.y + 18} Q ${head.x + head.width / 2} ${head.y + 4} ${head.x + head.width - 26} ${head.y + 18}`}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.11}
        />

        <Eye
          cx={eye.leftX}
          cy={eye.centerY}
          shape={shape}
          blink={blink}
          gazeX={gazeX + wanderX}
          gazeY={gazeY + wanderY}
        />
        <Eye
          cx={eye.rightX}
          cy={eye.centerY}
          shape={shape}
          blink={blink}
          gazeX={gazeX + wanderX}
          gazeY={gazeY + wanderY}
        />

        {/* Manos al final: al señalar la mano sale del cuerpo y tiene que
            quedar por delante de la carcasa. */}
        <Hand
          x={leftHand.x}
          y={leftHand.y}
          radius={hand.radius}
          pose={leftPose}
          angleDeg={leftAngle}
        />
        <Hand
          x={rightHand.x}
          y={rightHand.y}
          radius={hand.radius}
          pose={rightPose}
          angleDeg={rightAngle}
        />
      </g>
    </svg>
  );
};

/**
 * Bocadillo del personaje. Aparece a su lado y escribe el texto.
 * Separado de `Oki` para que el personaje pueda usarse mudo en un rincon.
 */
export const OkiSpeech: React.FC<{ text: string; startFrame?: number }> = ({
  text,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const reveal = progressBetween(frame, startFrame, startFrame + text.length * 1.1);
  const visible = text.slice(0, Math.ceil(reveal * text.length));
  const caretOn = reveal < 1 && Math.floor(frame / 8) % 2 === 0;

  return (
    <div
      style={{
        position: 'relative',
        maxWidth: 620,
        padding: '22px 28px',
        borderRadius: theme.radius.lg,
        backgroundColor: theme.color.bgElevated,
        border: `2px solid ${theme.color.line}`,
        color: theme.color.text,
        fontSize: theme.size.label,
        lineHeight: 1.5,
        boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
        opacity: progressBetween(frame, startFrame - 6, startFrame + 6),
      }}
    >
      {visible}
      {caretOn ? <span style={{ color: theme.color.accent }}>▌</span> : null}
    </div>
  );
};
