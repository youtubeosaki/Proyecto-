import type React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { sceneCamera } from '../theme/motion';
import { Ambience } from './Ambience';

/**
 * Contenedor de escena. No es solo un fondo: es la camara.
 *
 * Cada escena recibe un push-in lento y una deriva propia. Dos escenas
 * consecutivas usan `phase` distinta para que su deriva no coincida, que es
 * lo que delataria el truco.
 *
 * El ambiente queda FUERA de la transformacion de camara a proposito: si el
 * fondo hiciera zoom junto al contenido, se perderia la sensacion de
 * profundidad y volveriamos a tener una imagen plana moviendose.
 */
export const Frame: React.FC<{
  children: React.ReactNode;
  padded?: boolean;
  /** Desfasa la deriva de esta escena respecto a las vecinas. */
  phase?: number;
  /** Cuanto zoom acumula la escena. 0 desactiva la camara. */
  zoom?: number;
  ambienceIntensity?: number;
}> = ({ children, padded = true, phase = 0, zoom = 0.045, ambienceIntensity = 1 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const camera = sceneCamera(frame, durationInFrames, { zoom, phase });

  return (
    <AbsoluteFill style={{ fontFamily: theme.font.sans }}>
      <Ambience intensity={ambienceIntensity} />

      <AbsoluteFill
        style={{
          padding: padded ? 96 : 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          transform: `scale(${camera.scale.toFixed(4)}) translate(${camera.x.toFixed(2)}px, ${camera.y.toFixed(2)}px)`,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
