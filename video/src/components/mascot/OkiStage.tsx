import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { theme } from '../../theme';
import { easeInOutSine, oscillate, progressBetween } from '../../theme/motion';
import type { OkiExpression } from './identity';
import { OKI_VIEWBOX } from './identity';
import { Oki, pointingHandAt } from './Oki';

/**
 * ESCENARIO DE OKI
 *
 * Coloca al personaje en coordenadas de la escena y lo mueve entre puntos,
 * en vez de anclarlo a una esquina con CSS.
 *
 * La diferencia importa: anclado a una esquina, Oki es una pegatina encima
 * del video. Con coordenadas puede pararse junto a un nodo concreto,
 * acompañar a un paquete mientras viaja y señalar lo que se esta narrando.
 * Eso es lo que lo convierte en parte de la escena.
 *
 * Una posicion puede ser un punto fijo o una funcion del frame. Lo segundo es
 * lo que permite seguir a algo que se mueve: el escenario no sabe que es un
 * paquete, solo pregunta "donde estas en este frame".
 */

export type OkiPositionAt = { x: number; y: number } | ((frame: number) => { x: number; y: number });

export interface OkiBeat {
  /** Frame en el que Oki TERMINA de llegar aqui. El viaje ocurre antes. */
  atFrame: number;
  position: OkiPositionAt;
  expression?: OkiExpression;
  /** Punto que mira. Si `pointing`, ademas lo señala. */
  lookAt?: OkiPositionAt;
  pointing?: boolean;
  /** Frames que tarda en desplazarse hasta aqui desde el beat anterior. */
  travelFrames?: number;
}

export interface OkiStageProps {
  width: number;
  height: number;
  beats: OkiBeat[];
  size?: number;
  seed?: number;
  startFrame?: number;
}

const DEFAULT_TRAVEL = 26;

function resolve(position: OkiPositionAt, frame: number): { x: number; y: number } {
  return typeof position === 'function' ? position(frame) : position;
}

/** Estado completo del personaje en un frame. Funcion pura: se puede evaluar
 *  tambien en frame-1 para sacar la velocidad sin guardar estado. */
function stateAt(beats: readonly OkiBeat[], frame: number) {
  const first = beats[0];
  if (!first) return null;

  // Antes del primer beat, ya esta en su sitio esperando.
  if (frame <= first.atFrame) {
    return {
      ...resolve(first.position, frame),
      expression: first.expression ?? 'neutral',
      lookAt: first.lookAt ? resolve(first.lookAt, frame) : null,
      pointing: first.pointing ?? false,
      travelling: 0,
    };
  }

  for (let i = 0; i < beats.length; i++) {
    const current = beats[i]!;
    const next = beats[i + 1];

    if (!next) {
      return {
        ...resolve(current.position, frame),
        expression: current.expression ?? 'neutral',
        lookAt: current.lookAt ? resolve(current.lookAt, frame) : null,
        pointing: current.pointing ?? false,
        travelling: 0,
      };
    }

    if (frame > next.atFrame) continue;

    const travel = next.travelFrames ?? DEFAULT_TRAVEL;
    const departure = Math.max(current.atFrame, next.atFrame - travel);

    // Aun quieto en el beat actual.
    if (frame <= departure) {
      return {
        ...resolve(current.position, frame),
        expression: current.expression ?? 'neutral',
        lookAt: current.lookAt ? resolve(current.lookAt, frame) : null,
        pointing: current.pointing ?? false,
        travelling: 0,
      };
    }

    // En transito. Acelera y frena: un desplazamiento a velocidad constante
    // se lee como un objeto arrastrado, no como alguien que se mueve.
    const t = easeInOutSine(progressBetween(frame, departure, next.atFrame));
    const from = resolve(current.position, frame);
    const to = resolve(next.position, frame);

    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      // Durante el viaje ya adopta la expresion de destino: llega "puesto".
      expression: next.expression ?? current.expression ?? 'neutral',
      lookAt: next.lookAt ? resolve(next.lookAt, frame) : null,
      // No señala mientras se desplaza; señalar en movimiento se lee mal.
      pointing: false,
      travelling: Math.sin(t * Math.PI),
    };
  }

  return null;
}

export const OkiStage: React.FC<OkiStageProps> = ({
  width,
  height,
  beats,
  size = 210,
  seed = 4,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();

  const state = stateAt(beats, frame);
  const previous = stateAt(beats, frame - 1);
  if (!state) return null;

  // Velocidad para inclinar el cuerpo hacia donde va.
  const vx = previous ? state.x - previous.x : 0;
  // Inclinacion contenida: pasado cierto angulo deja de leerse como impulso
  // y empieza a leerse como que se cae.
  const lean = Math.max(-8, Math.min(8, vx * 1.1));

  // Rebote durante el desplazamiento: sin el, Oki se desliza como una ficha.
  const hop = -Math.abs(Math.sin(frame * 0.34)) * 11 * state.travelling;

  // Mirada normalizada hacia el objetivo.
  let gazeX = 0;
  let gazeY = 0;
  if (state.lookAt) {
    gazeX = Math.max(-1, Math.min(1, (state.lookAt.x - state.x) / 260));
    gazeY = Math.max(-1, Math.min(1, (state.lookAt.y - state.y) / 200));
  } else if (vx !== 0) {
    gazeX = Math.max(-1, Math.min(1, vx * 0.35));
  }

  /**
   * Angulo hacia el objetivo, y de ahi la posicion de la mano que señala.
   *
   * El haz nace en la MANO, no en el costado del cuerpo. Se calcula con el
   * mismo helper que usa el personaje para colocarla, porque si cada lado
   * hiciera su propia cuenta el haz acabaria naciendo a unos pixeles de la
   * mano y eso se ve.
   */
  const pointAngle = state.lookAt
    ? (Math.atan2(state.lookAt.y - state.y, state.lookAt.x - state.x) * 180) / Math.PI
    : 0;

  // El lienzo del personaje se escala a `size`; hay que llevar las
  // coordenadas del lienzo a pixeles de la escena.
  const scale = size / OKI_VIEWBOX.height;
  const hand = pointingHandAt(pointAngle);
  const pointerOrigin = state.lookAt
    ? {
        x: state.x + (hand.x - OKI_VIEWBOX.width / 2) * scale,
        y: state.y + (hand.y - OKI_VIEWBOX.height / 2) * scale,
      }
    : null;

  return (
    <div style={{ position: 'absolute', inset: 0, width, height, pointerEvents: 'none' }}>
      {/* Haz de señalado. Va por debajo del personaje para que salga de detras
          de el y no le tape la cara. */}
      {state.pointing && state.lookAt && pointerOrigin ? (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <line
            x1={pointerOrigin.x}
            y1={pointerOrigin.y}
            x2={state.lookAt.x}
            y2={state.lookAt.y}
            stroke={theme.color.accent}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="2 14"
            // El guion se desplaza: el haz "corre" hacia el objetivo.
            strokeDashoffset={-frame * 1.6}
            opacity={0.75}
          />
          {/* Anillo que late sobre lo señalado. Es lo que cierra el gesto:
              sin el, el haz apunta a la nada. */}
          <circle
            cx={state.lookAt.x}
            cy={state.lookAt.y}
            r={44 + oscillate(frame, 46) * 7}
            fill="none"
            stroke={theme.color.accent}
            strokeWidth={3}
            opacity={0.75}
          />
          <circle
            cx={state.lookAt.x}
            cy={state.lookAt.y}
            r={16}
            fill={theme.color.accent}
            opacity={0.14 + 0.06 * (oscillate(frame, 46) + 1)}
          />
        </svg>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: state.x,
          top: state.y,
          transform: `translate(-50%, -50%) translateY(${hop.toFixed(2)}px) rotate(${lean.toFixed(2)}deg)`,
          transformOrigin: 'center bottom',
        }}
      >
        <Oki
          expression={state.expression}
          size={size}
          seed={seed}
          startFrame={startFrame}
          gazeX={gazeX}
          gazeY={gazeY}
          handPose={state.pointing && state.lookAt ? 'point' : 'idle'}
          pointAngle={pointAngle}
        />
      </div>
    </div>
  );
};
