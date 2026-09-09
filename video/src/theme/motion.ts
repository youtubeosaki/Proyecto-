import { interpolate, spring } from 'remotion';
import { theme } from './index';

/**
 * SISTEMA DE MOVIMIENTO
 *
 * La diferencia entre motion graphics y una presentacion de diapositivas no
 * son las transiciones de entrada: es que en motion graphics nada se queda
 * completamente quieto. Un elemento que entra y se congela lee como una
 * diapositiva por muy bonita que sea su entrada.
 *
 * Estos helpers se dividen en dos familias:
 *   - Entrada: ocurren una vez (enterUp, blurIn, popIn).
 *   - Continuas: no paran nunca (breathe, drift, orbit). Son las que hacen
 *     que el plano se sienta vivo.
 *
 * Toda escena deberia usar al menos una de cada familia.
 */

/* ---------------------------------------------------------------------------
 * Curvas base
 * ------------------------------------------------------------------------ */

/** Progreso 0..1 entre dos frames, con clamp. El caballo de batalla. */
export function progressBetween(frame: number, startFrame: number, endFrame: number): number {
  return interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Salida cubica: arranca rapido, frena al final. Para valores que "aterrizan". */
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Quinta: aun mas pronunciada. Para movimientos de camara largos. */
export const easeOutQuint = (t: number): number => 1 - (1 - t) ** 5;

/** Entrada y salida suave. Para bucles que deben volver a su punto de partida. */
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

/* ---------------------------------------------------------------------------
 * Entradas
 * ------------------------------------------------------------------------ */

export interface Entrance {
  opacity: number;
  translateY: number;
  scale: number;
  blur: number;
}

/**
 * Entrada estandar del canal: sube, aparece, se enfoca y asienta con un
 * micro-overshoot.
 *
 * El desenfoque es lo que la separa de un fade normal: el ojo lee "esto
 * acaba de llegar" en vez de "esto estaba en opacidad 0".
 */
export function enterUp(frame: number, startFrame = 0, fps: number = theme.timing.fps): Entrance {
  const t = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 26, mass: 0.7, stiffness: 130 },
  });

  return {
    opacity: interpolate(t, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
    translateY: interpolate(t, [0, 1], [38, 0]),
    scale: interpolate(t, [0, 1], [0.965, 1]),
    blur: interpolate(t, [0, 0.75], [10, 0], { extrapolateRight: 'clamp' }),
  };
}

/** Aparicion con rebote corto. Para numeros, badges y cosas que deben golpear. */
export function popIn(frame: number, startFrame = 0, fps: number = theme.timing.fps): Entrance {
  const t = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 11, mass: 0.5, stiffness: 180 },
  });

  return {
    opacity: interpolate(t, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
    translateY: 0,
    scale: interpolate(t, [0, 1], [0.7, 1]),
    blur: interpolate(t, [0, 0.5], [8, 0], { extrapolateRight: 'clamp' }),
  };
}

/** Convierte una Entrance en las propiedades CSS correspondientes. */
export function entranceStyle(entrance: Entrance, extraTransform = ''): React.CSSProperties {
  return {
    opacity: entrance.opacity,
    transform:
      `translateY(${entrance.translateY.toFixed(2)}px) scale(${entrance.scale.toFixed(4)})` +
      (extraTransform ? ` ${extraTransform}` : ''),
    filter: entrance.blur > 0.15 ? `blur(${entrance.blur.toFixed(2)}px)` : undefined,
  };
}

/* ---------------------------------------------------------------------------
 * Movimiento continuo
 *
 * Amplitudes deliberadamente pequenas. Si notas conscientemente que algo se
 * mueve, te has pasado: el efecto debe leerse como "esto esta vivo", no como
 * "esto se esta moviendo".
 * ------------------------------------------------------------------------ */

/** Oscilacion suave -1..1. `periodInFrames` es un ciclo completo. */
export function oscillate(frame: number, periodInFrames: number, phase = 0): number {
  return Math.sin((frame / periodInFrames) * Math.PI * 2 + phase);
}

/** Respiracion de escala. Un elemento vivo late, aunque sea un 0.6%. */
export function breathe(frame: number, periodInFrames = 150, amplitude = 0.006, phase = 0): number {
  return 1 + oscillate(frame, periodInFrames, phase) * amplitude;
}

/**
 * Deriva en dos ejes con periodos primos entre si.
 *
 * Que los periodos no sean multiplos es lo que evita que el movimiento se
 * sienta ciclico: la trayectoria tarda muchisimo en repetirse.
 */
export function drift(
  frame: number,
  amplitude = 6,
  periodX = 210,
  periodY = 290,
  phase = 0,
): { x: number; y: number } {
  return {
    x: oscillate(frame, periodX, phase) * amplitude,
    y: oscillate(frame, periodY, phase * 1.7) * amplitude,
  };
}

/** Pulso 0..1 que decae. Para destellos al llegar un paquete o cerrarse un paso. */
export function pulse(frame: number, atFrame: number, durationInFrames = 18): number {
  const t = progressBetween(frame, atFrame, atFrame + durationInFrames);
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(t * Math.PI) ** 2;
}

/* ---------------------------------------------------------------------------
 * Camara
 * ------------------------------------------------------------------------ */

export interface CameraState {
  scale: number;
  x: number;
  y: number;
}

/**
 * Camara lenta por escena: un push-in casi imperceptible mas una deriva.
 *
 * Es el truco que mas separa "video" de "diapositiva". Un plano fijo se lee
 * como una imagen; el mismo plano con un 3% de zoom progresivo se lee como
 * una toma.
 */
export function sceneCamera(
  frame: number,
  durationInFrames: number,
  options: { zoom?: number; driftAmount?: number; phase?: number } = {},
): CameraState {
  const { zoom = 0.045, driftAmount = 10, phase = 0 } = options;

  const t = easeOutQuint(progressBetween(frame, 0, durationInFrames));
  const wander = drift(frame, driftAmount, 260, 340, phase);

  return {
    scale: 1 + zoom * t,
    x: wander.x,
    y: wander.y,
  };
}

/* ---------------------------------------------------------------------------
 * Texto
 * ------------------------------------------------------------------------ */

/**
 * Reparte una frase en palabras con su frame de entrada escalonado.
 *
 * Un titulo que aparece palabra a palabra se lee mientras aparece; uno que
 * aparece entero obliga a leerlo despues. En video, donde el espectador tiene
 * cuatro segundos, esa diferencia es real.
 */
export function staggerWords(
  text: string,
  startFrame: number,
  framesPerWord = 2.5,
): { word: string; at: number }[] {
  return text.split(/\s+/).map((word, index) => ({
    word,
    at: startFrame + index * framesPerWord,
  }));
}
