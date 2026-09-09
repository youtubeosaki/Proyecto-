import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { z } from 'zod';
import { Ambience } from '../components/Ambience';
import { Oki } from '../components/mascot/Oki';
import { theme } from '../theme';

/**
 * MINIATURA
 *
 * Se genera como componente de Remotion y no en un editor de imagen por la
 * misma razon que el personaje: para que todas las miniaturas del canal
 * compartan fondo, tipografia y personaje sin que nadie tenga que recordar
 * los valores.
 *
 * Se renderiza como still:
 *
 *   npx remotion still src/index.ts Thumbnail out.png --props=<props.json>
 *
 * Decisiones especificas del formato:
 *
 * - TIPOGRAFIA ENORME. La miniatura se ve a 210x118 px en el movil. Lo que
 *   no se lea a ese tamaño no existe. Como maximo cinco o seis palabras.
 * - SIN TEXTO EN LA ESQUINA INFERIOR DERECHA: ahi va la marca de duracion
 *   que pone YouTube encima.
 * - CONTRASTE ALTO. El feed se ve en pantallas malas y con brillo bajo.
 */

export const thumbnailSchema = z.object({
  headline: z.string(),
  kicker: z.string().optional(),
  /** Expresion de Oki. La contradiccion pide sorpresa; un dato, foco. */
  expression: z
    .enum(['neutral', 'curious', 'thinking', 'surprised', 'happy', 'focused'])
    .default('surprised'),
});

export type ThumbnailProps = z.input<typeof thumbnailSchema>;

/**
 * Tamaño de letra segun cuanto texto haya.
 *
 * Un tamaño fijo obliga a que todos los titulares midan lo mismo, y no lo
 * miden: "Por que se pierde un mensaje" y la version larga del mismo titular
 * necesitan cuerpos muy distintos para ocupar el mismo hueco. Con un valor
 * fijo, el titular largo se sale de la miniatura sin avisar.
 */
function headlineSize(text: string): number {
  const length = text.length;
  if (length <= 24) return 96;
  if (length <= 38) return 78;
  if (length <= 52) return 64;
  return 54;
}

export const Thumbnail: React.FC<ThumbnailProps> = ({
  headline,
  kicker,
  expression = 'surprised',
}) => (
  <AbsoluteFill style={{ backgroundColor: theme.color.bg, fontFamily: theme.font.sans }}>
    <Ambience intensity={1.15} />

    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '0 64px',
        gap: 24,
        // La miniatura es un lienzo fijo: si algo se sale, se recorta aqui en
        // vez de deformar el resto de la composicion.
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        {kicker ? (
          <div
            style={{
              fontFamily: theme.font.mono,
              fontSize: 34,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: theme.color.accent,
            }}
          >
            {kicker}
          </div>
        ) : null}

        <div
          style={{
            fontSize: headlineSize(headline),
            fontWeight: 800,
            lineHeight: 1.04,
            color: theme.color.text,
            // Sombra dura: en un feed claro, el texto sin sombra se pierde
            // contra el degradado del fondo.
            textShadow: '0 8px 40px rgba(0,0,0,0.85)',
          }}
        >
          {headline}
        </div>

        <div
          style={{
            width: 140,
            height: 7,
            borderRadius: 4,
            background: `linear-gradient(90deg, ${theme.color.accent}, transparent)`,
          }}
        />
      </div>

      {/* Oki mirando hacia el texto: dirige la vista del espectador ahi. */}
      <div style={{ flexShrink: 0, paddingBottom: 20 }}>
        <Oki
          expression={expression}
          size={420}
          seed={11}
          gazeX={-0.55}
          handPose="present"
          animateEntrance={false}
        />
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);
