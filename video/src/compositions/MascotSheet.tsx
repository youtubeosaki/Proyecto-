import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { Ambience } from '../components/Ambience';
import { Oki } from '../components/mascot/Oki';
import { OKI_EXPRESSIONS } from '../components/mascot/identity';
import { theme } from '../theme';

/**
 * Hoja de contacto del personaje.
 *
 * No es contenido: es la herramienta de control de calidad de la identidad.
 * Renderiza las seis expresiones a la vez para poder comparar de un vistazo
 * si alguna se ha desviado, y para revisar el parpadeo y la respiracion sin
 * tener que buscarlos dentro de un video.
 *
 *   pnpm --filter @osaki/video exec remotion still src/index.ts MascotSheet oki.png --frame=90
 */

export const MASCOT_SHEET_DURATION = 300;

export const MascotSheet: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
    <Ambience intensity={0.6} />

    <AbsoluteFill
      style={{
        padding: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        fontFamily: theme.font.sans,
      }}
    >
      <div style={{ marginBottom: 56 }}>
        <div
          style={{
            fontFamily: theme.font.mono,
            fontSize: 20,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: theme.color.accent,
          }}
        >
          Identidad del canal
        </div>
        <h1
          style={{
            fontSize: 60,
            fontWeight: 700,
            color: theme.color.text,
            margin: '14px 0 0',
          }}
        >
          Oki — hoja de expresiones
        </h1>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${OKI_EXPRESSIONS.length}, 1fr)`,
          gap: 24,
          alignItems: 'end',
        }}
      >
        {OKI_EXPRESSIONS.map((expression, index) => (
          <div
            key={expression}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 26,
              padding: '32px 12px 24px',
              borderRadius: theme.radius.lg,
              backgroundColor: 'rgba(20, 25, 34, 0.5)',
              border: `1px solid ${theme.color.grid}`,
            }}
          >
            {/* Semillas distintas: cada uno parpadea a su ritmo, que es
                justamente lo que hay que poder revisar aqui. */}
            <Oki expression={expression} seed={index + 1} size={190} startFrame={index * 4} />
            <div
              style={{
                fontFamily: theme.font.mono,
                fontSize: 19,
                color: theme.color.textMuted,
                letterSpacing: 1,
              }}
            >
              {expression}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);
