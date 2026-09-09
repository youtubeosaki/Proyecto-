import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { theme } from '../theme/index';

/**
 * Fondo comun de todas las escenas: color base, rejilla sutil y vineteado.
 *
 * La rejilla existe para que las escenas no floten en un vacio plano; a
 * 4% de opacidad no se lee conscientemente pero da sensacion de plano tecnico.
 */
export const Frame: React.FC<{ children: React.ReactNode; padded?: boolean }> = ({
  children,
  padded = true,
}) => (
  <AbsoluteFill style={{ backgroundColor: theme.color.bg, fontFamily: theme.font.sans }}>
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(${theme.color.grid} 1px, transparent 1px),
                          linear-gradient(90deg, ${theme.color.grid} 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
        opacity: 0.4,
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, transparent 35%, ${theme.color.bg} 100%)`,
      }}
    />
    <AbsoluteFill
      style={{
        padding: padded ? 96 : 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      {children}
    </AbsoluteFill>
  </AbsoluteFill>
);
