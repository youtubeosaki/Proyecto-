import type React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { z } from 'zod';
import { resolveScene } from '../scenes/registry';
import { theme } from '../theme';

/**
 * COMPOSICION GENERADA
 *
 * Se construye a partir del storyboard que produce el pipeline, no a mano.
 * `Demo` sigue existiendo como prueba de humo del motor; esta es la que
 * renderiza los videos reales.
 *
 * El storyboard llega como props de entrada:
 *
 *   npx remotion render src/index.ts Generated out.mp4 --props=<storyboard.json>
 *
 * La duracion sale de `calculateMetadata`, asi que el video dura exactamente
 * lo que dura la narracion: nadie tiene que mantener sincronizado un numero
 * en dos sitios.
 */

const timingSchema = z.object({
  segmentIndex: z.number(),
  startFrame: z.number(),
  durationInFrames: z.number(),
  audioSeconds: z.number(),
});

export const generatedSchema = z.object({
  videoId: z.string(),
  fps: z.number().default(30),
  width: z.number().default(1920),
  height: z.number().default(1080),
  scenes: z.array(
    z.object({
      segmentIndex: z.number(),
      kind: z.string(),
      props: z.record(z.unknown()),
      timing: timingSchema.optional(),
    }),
  ),
  /**
   * Rutas de audio por segmento. Opcional: sin ellas el video se renderiza
   * mudo, que es justo lo que hace falta para revisar el montaje visual
   * antes de grabar nada.
   */
  audio: z
    .array(z.object({ index: z.number(), audioPath: z.string() }))
    .optional(),
});

export type GeneratedProps = z.input<typeof generatedSchema>;

/** Duracion por defecto de una escena sin timing medido. */
const FALLBACK_SCENE_FRAMES = 150;
const TRANSITION_FRAMES = 15;

export function totalFrames(props: GeneratedProps): number {
  const scenes = props.scenes ?? [];
  if (scenes.length === 0) return FALLBACK_SCENE_FRAMES;

  const sum = scenes.reduce(
    (total, scene) => total + (scene.timing?.durationInFrames ?? FALLBACK_SCENE_FRAMES),
    0,
  );

  // TransitionSeries solapa escenas: la duracion total es la suma menos los
  // solapes. Calcularlo evita que un cambio de ritmo deje frames negros.
  return Math.max(1, sum - TRANSITION_FRAMES * Math.max(0, scenes.length - 1));
}

const FinalFade: React.FC<{ total: number; fps: number }> = ({ total, fps }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [total - Math.round(fps * 0.6), total], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ backgroundColor: '#000', opacity, pointerEvents: 'none' }} />;
};

/** Se muestra si el storyboard llega vacio, en vez de renderizar negro. */
const EmptyState: React.FC<{ videoId: string }> = ({ videoId }) => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.color.bg,
      color: theme.color.textMuted,
      fontFamily: theme.font.mono,
      fontSize: 28,
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 80,
    }}
  >
    El storyboard de {videoId || '(sin id)'} no tiene escenas.
    <br />
    Ejecuta primero la etapa de storyboard.
  </AbsoluteFill>
);

export const Generated: React.FC<GeneratedProps> = (props) => {
  const scenes = props.scenes ?? [];
  const fps = props.fps ?? 30;
  const total = totalFrames(props);

  if (scenes.length === 0) return <EmptyState videoId={props.videoId} />;

  const audioByIndex = new Map((props.audio ?? []).map((entry) => [entry.index, entry.audioPath]));

  return (
    <AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
      <TransitionSeries>
        {scenes.flatMap((scene, position) => {
          const durationInFrames = scene.timing?.durationInFrames ?? FALLBACK_SCENE_FRAMES;

          /**
           * Un tipo de escena desconocido NO se sustituye por otro parecido:
           * se pinta un cartel con el nombre que falta. El fallo tiene que
           * verse en el video, porque un fallback silencioso produce un
           * render sin errores que explica mal y que nadie revisa.
           */
          const resolved = resolveScene(scene.kind, scene.props);
          const body = resolved.ok ? (
            <resolved.Component {...resolved.props} />
          ) : (
            <MissingScene kind={scene.kind} reason={resolved.reason} />
          );

          const audioPath = audioByIndex.get(scene.segmentIndex);

          const sequence = (
            <TransitionSeries.Sequence
              key={`scene-${scene.segmentIndex}`}
              durationInFrames={durationInFrames}
            >
              {body}
              {audioPath ? (
                <Sequence from={0}>
                  <Audio src={staticFile(audioPath)} />
                </Sequence>
              ) : null}
            </TransitionSeries.Sequence>
          );

          if (position === 0) return [sequence];

          return [
            <TransitionSeries.Transition
              key={`transition-${scene.segmentIndex}`}
              presentation={fade()}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            />,
            sequence,
          ];
        })}
      </TransitionSeries>

      <FinalFade total={total} fps={fps} />
    </AbsoluteFill>
  );
};

/** Cartel de escena que falta. Deliberadamente feo: tiene que molestar. */
const MissingScene: React.FC<{ kind: string; reason: string }> = ({ kind, reason }) => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.color.bg,
      border: `6px solid ${theme.color.danger}`,
      color: theme.color.danger,
      fontFamily: theme.font.mono,
      fontSize: 34,
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 100,
      gap: 24,
    }}
  >
    <div>ESCENA SIN COMPONENTE</div>
    <div style={{ color: theme.color.text }}>{kind}</div>
    <div style={{ fontSize: 22, color: theme.color.textMuted, maxWidth: 1200 }}>{reason}</div>
  </AbsoluteFill>
);
