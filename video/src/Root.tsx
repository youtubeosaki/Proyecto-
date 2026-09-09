import type React from 'react';
import { Composition } from 'remotion';
import { Demo, DEMO_DURATION_IN_FRAMES } from './compositions/Demo';
import { theme } from './theme/index';

/**
 * Registro de composiciones de Remotion.
 *
 * A partir de la Fase 3, las composiciones de video reales se registran aqui
 * de forma dinamica a partir del storyboard que produce el pipeline. `Demo`
 * se queda como prueba de humo del motor: si esta deja de renderizar, algo
 * se rompio en los componentes base.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Demo"
      component={Demo}
      durationInFrames={DEMO_DURATION_IN_FRAMES}
      fps={theme.timing.fps}
      width={1920}
      height={1080}
    />
  </>
);
