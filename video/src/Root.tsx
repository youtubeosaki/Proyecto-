import type React from 'react';
import { Composition } from 'remotion';
import { Demo, DEMO_DURATION_IN_FRAMES } from './compositions/Demo';
import { MascotSheet, MASCOT_SHEET_DURATION } from './compositions/MascotSheet';
import { Generated, generatedSchema, totalFrames, type GeneratedProps } from './compositions/Generated';
import { Thumbnail, thumbnailSchema } from './compositions/Thumbnail';
import { Short, shortSchema, type ShortProps } from './compositions/Short';
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

    {/*
      La composicion de los videos reales. Se construye desde el storyboard
      que produce el pipeline, que llega como props de entrada:

        npx remotion render src/index.ts Generated out.mp4 --props=<storyboard.json>

      La duracion sale de las props, asi que el video dura exactamente lo que
      dura la narracion y nadie mantiene el numero sincronizado a mano.
    */}
    <Composition
      id="Generated"
      component={Generated}
      schema={generatedSchema}
      defaultProps={{ videoId: '', fps: theme.timing.fps, width: 1920, height: 1080, scenes: [] }}
      calculateMetadata={({ props }: { props: GeneratedProps }) => ({
        durationInFrames: totalFrames(props),
        fps: props.fps ?? theme.timing.fps,
        width: props.width ?? 1920,
        height: props.height ?? 1080,
      })}
      durationInFrames={150}
      fps={theme.timing.fps}
      width={1920}
      height={1080}
    />

    {/*
      Short vertical. Reutiliza la misma escena del video largo escalada a
      9:16, con subtitulos quemados porque los Shorts se ven sin sonido.
    */}
    <Composition
      id="Short"
      component={Short}
      schema={shortSchema}
      defaultProps={{
        title: 'Titular del Short',
        scene: { kind: 'titleCard', props: { title: 'Escena' } },
        durationInFrames: 600,
        captions: [],
      }}
      calculateMetadata={({ props }: { props: ShortProps }) => ({
        durationInFrames: props.durationInFrames ?? 600,
      })}
      durationInFrames={600}
      fps={theme.timing.fps}
      width={1080}
      height={1920}
    />

    {/*
      Miniatura. Se renderiza como still, no como video:
        npx remotion still src/index.ts Thumbnail out.png --props=<props.json>
    */}
    <Composition
      id="Thumbnail"
      component={Thumbnail}
      schema={thumbnailSchema}
      defaultProps={{ headline: 'Titular de la miniatura', kicker: 'Ingenieria explicada' }}
      durationInFrames={1}
      fps={theme.timing.fps}
      width={1280}
      height={720}
    />

    {/* Control de calidad de la identidad, no contenido del canal. */}
    <Composition
      id="MascotSheet"
      component={MascotSheet}
      durationInFrames={MASCOT_SHEET_DURATION}
      fps={theme.timing.fps}
      width={1920}
      height={1080}
    />
  </>
);
