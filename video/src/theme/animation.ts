import { interpolate, spring } from 'remotion';
import { theme } from './index';

/**
 * Helpers de animacion compartidos.
 *
 * El objetivo es que ninguna escena llame a `interpolate` con numeros magicos:
 * si todo el canal usa las mismas curvas, se ve intencional en vez de casual.
 */

/** Entrada estandar: aparece y sube un poco. Devuelve opacidad y desplazamiento. */
export function enterUp(frame: number, startFrame = 0, fps: number = theme.timing.fps) {
  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 200, mass: 0.6 },
  });

  return {
    opacity: progress,
    translateY: interpolate(progress, [0, 1], [24, 0]),
  };
}

/** Desvanecido lineal entre dos frames. Para cosas que no deben llamar la atencion. */
export function fadeIn(frame: number, startFrame: number, durationInFrames: number = theme.timing.normal) {
  return interpolate(frame, [startFrame, startFrame + durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Progreso 0..1 con clamp en ambos extremos. El caballo de batalla. */
export function progressBetween(frame: number, startFrame: number, endFrame: number): number {
  return interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
