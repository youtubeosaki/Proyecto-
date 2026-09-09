import type React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { Oki } from '../components/mascot/Oki';
import { SceneSizeProvider } from '../components/SceneSize';
import { resolveScene } from '../scenes/registry';
import { theme } from '../theme';
import { entranceStyle, enterUp, progressBetween } from '../theme/motion';

/**
 * SHORT VERTICAL
 *
 * Reutiliza la MISMA escena del video largo, sin rediseñarla. Los componentes
 * usan coordenadas en porcentaje precisamente para esto: el diagrama que
 * funciona en 16:9 funciona en 9:16 sin tocar nada.
 *
 * Lo que cambia es el envoltorio: titular arriba, escena en el centro con la
 * proporcion del video largo, y subtitulos quemados abajo.
 *
 * Los subtitulos no son accesibilidad aqui: los Shorts se ven sin sonido la
 * mayor parte del tiempo, asi que el subtitulo ES el contenido.
 */

export const shortSchema = z.object({
  title: z.string(),
  scene: z.object({ kind: z.string(), props: z.record(z.unknown()) }),
  durationInFrames: z.number().int().positive().default(600),
  audioPath: z.string().optional(),
  captions: z
    .array(
      z.object({
        text: z.string(),
        startFrame: z.number().int().nonnegative(),
        durationInFrames: z.number().int().positive(),
      }),
    )
    .default([]),
});

export type ShortProps = z.input<typeof shortSchema>;

/**
 * La escena se dibuja en un lienzo VERTICAL nativo, no en uno horizontal
 * escalado.
 *
 * Escalar un lienzo de 1920x1080 al ancho de 1080 lo encoge a 0.56 y deja
 * media pantalla vacia. Maquetar directamente sobre 1080x1150 llena el
 * formato, y no cuesta nada porque los componentes posicionan por PORCENTAJE
 * del area util: el mismo diagrama se reparte sobre el lienzo que le den.
 *
 * Esa decision de las coordenadas en porcentaje se tomo pensando exactamente
 * en esto, y es lo que evita tener una variante vertical de cada componente
 * que mantener sincronizada con la horizontal.
 */
const SCENE_WIDTH = 1080;
const SCENE_HEIGHT = 1150;

export const Short: React.FC<ShortProps> = ({
  title,
  scene,
  audioPath,
  captions = [],
}) => {
  const frame = useCurrentFrame();
  const resolved = resolveScene(scene.kind, scene.props);

  /**
   * Si la escena ya trae a Oki recorriendola (su `guide`), no se pone
   * ademas el de la esquina: dos Okis a la vez rompen la ilusion de que hay
   * un solo personaje y ademas compiten por la atencion.
   */
  const sceneHasOki = Boolean((scene.props as { guide?: unknown }).guide);

  const active = captions.find(
    (caption) =>
      frame >= caption.startFrame && frame < caption.startFrame + caption.durationInFrames,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: theme.color.bg, fontFamily: theme.font.sans }}>
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}

      {/* Titular. En un Short, el texto de arriba decide en dos segundos. */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-start',
          padding: '110px 64px 0',
          height: 'auto',
        }}
      >
        <div
          style={{
            fontSize: 74,
            fontWeight: 800,
            lineHeight: 1.08,
            color: theme.color.text,
            textShadow: '0 6px 30px rgba(0,0,0,0.8)',
            ...entranceStyle(enterUp(frame, 2, 30)),
          }}
        >
          {title}
        </div>
      </AbsoluteFill>

      {/* La escena del video largo, escalada al ancho vertical. */}
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 300 }}
      >
        <div
          style={{
            width: SCENE_WIDTH,
            height: SCENE_HEIGHT,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {resolved.ok ? (
            <SceneSizeProvider width={SCENE_WIDTH} height={SCENE_HEIGHT}>
              <resolved.Component {...resolved.props} />
            </SceneSizeProvider>
          ) : (
            <AbsoluteFill
              style={{
                backgroundColor: theme.color.bg,
                color: theme.color.danger,
                fontFamily: theme.font.mono,
                fontSize: 40,
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: 80,
              }}
            >
              ESCENA SIN COMPONENTE: {scene.kind}
            </AbsoluteFill>
          )}
        </div>
      </AbsoluteFill>

      {/* Subtitulos quemados. */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 56px 220px' }}>
        {active ? (
          <div
            style={{
              alignSelf: 'center',
              maxWidth: '92%',
              textAlign: 'center',
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.18,
              color: '#FFFFFF',
              backgroundColor: 'rgba(11, 14, 20, 0.82)',
              border: `2px solid ${theme.color.line}`,
              borderRadius: theme.radius.lg,
              padding: '22px 30px',
              // Aparece de golpe y no con fundido: un subtitulo que se
              // desvanece se lee peor y ademas retrasa la lectura.
              opacity: progressBetween(frame, active.startFrame, active.startFrame + 2),
            }}
          >
            {active.text}
          </div>
        ) : null}
      </AbsoluteFill>

      {/* Oki en la esquina: la marca del canal tambien en vertical, solo
          cuando la escena no lo lleva ya dentro. */}
      {sceneHasOki ? null : (
      <AbsoluteFill
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: '0 48px 60px',
          pointerEvents: 'none',
        }}
      >
        <Oki expression="focused" size={150} seed={21} gazeX={-0.4} startFrame={10} />
      </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
