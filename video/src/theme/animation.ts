/**
 * Compatibilidad. El sistema de movimiento vive ahora en `motion.ts`.
 * Este archivo se mantiene para que los imports antiguos sigan resolviendo.
 */
export { enterUp, progressBetween } from './motion';

import { interpolate } from 'remotion';
import { theme } from './index';

/** Desvanecido lineal. Para cosas que no deben llamar la atencion. */
export function fadeIn(
  frame: number,
  startFrame: number,
  durationInFrames: number = theme.timing.normal,
): number {
  return interpolate(frame, [startFrame, startFrame + durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
