import type React from 'react';
import { AbsoluteFill } from 'remotion';
import type { OkiExpression } from './identity';
import { Oki } from './Oki';

/**
 * Presencia de Oki en una esquina, sobre el contenido de una escena.
 *
 * Se usa cuando el personaje acompaña una explicacion sin ser el foco:
 * reacciona, mira hacia el contenido y desaparece. Va FUERA de la
 * transformacion de camara del `Frame`, en su propia capa absoluta, para que
 * el push-in de la escena no lo arrastre ni lo deforme.
 */
export const OkiCorner: React.FC<{
  expression?: OkiExpression;
  corner?: 'bottom-right' | 'bottom-left';
  size?: number;
  startFrame?: number;
  seed?: number;
}> = ({ expression = 'neutral', corner = 'bottom-right', size = 170, startFrame = 0, seed = 3 }) => {
  const isRight = corner === 'bottom-right';

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        // AbsoluteFill de Remotion es flex-direction: column por defecto, asi
        // que sin esta linea los dos ejes quedan invertidos y la esquina que
        // pides no es la que sale.
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: isRight ? 'flex-end' : 'flex-start',
        padding: '0 84px 60px',
        pointerEvents: 'none',
      }}
    >
      {/* Mira hacia dentro del plano, que es donde esta el contenido. */}
      <Oki
        expression={expression}
        size={size}
        startFrame={startFrame}
        seed={seed}
        gazeX={isRight ? -0.45 : 0.45}
        gazeY={-0.1}
      />
    </AbsoluteFill>
  );
};
