import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { theme } from '../theme';
import { breathe, drift, oscillate } from '../theme/motion';

/**
 * CAPA DE AMBIENTE
 *
 * Lo que separa un fondo de un plano. Cuatro capas, todas en movimiento
 * permanente y ninguna lo bastante fuerte como para competir con el contenido:
 *
 *   1. Aurora: tres manchas de color en deriva lenta.
 *   2. Rejilla con parallax: dos rejillas a distinta escala moviendose en
 *      direcciones opuestas. Da profundidad sin dibujar profundidad.
 *   3. Grano: rompe el banding de los degradados, que en YouTube se nota mucho.
 *   4. Vineteado: empuja la mirada al centro.
 *
 * Nota de rendimiento: las manchas son degradados radiales, no divs con
 * `filter: blur()`. Un blur de 200px sobre 900 frames multiplica por varias
 * veces el tiempo de render; un degradado radial ya es suave por definicion
 * y cuesta lo mismo que pintar un rectangulo.
 */

interface BlobSpec {
  color: string;
  /** Posicion base en porcentaje del plano. */
  x: number;
  y: number;
  /** Radio en porcentaje del ancho. */
  size: number;
  opacity: number;
  driftAmount: number;
  phase: number;
}

const BLOBS: BlobSpec[] = [
  { color: theme.color.accent, x: 22, y: 28, size: 55, opacity: 0.26, driftAmount: 46, phase: 0 },
  { color: theme.color.accentAlt, x: 78, y: 68, size: 48, opacity: 0.20, driftAmount: 58, phase: 2.1 },
  { color: theme.color.ok, x: 62, y: 18, size: 38, opacity: 0.11, driftAmount: 70, phase: 4.3 },
];

export const Ambience: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();

  // La rejilla se mueve muy despacio y en diagonal. A esta velocidad no se
  // percibe como movimiento, se percibe como que la camara flota.
  const gridNear = { x: (frame * 0.16) % 72, y: (frame * 0.09) % 72 };
  const gridFar = { x: (-frame * 0.06) % 240, y: (-frame * 0.04) % 240 };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.color.bg, overflow: 'hidden' }}>
      {/* 1. Aurora en deriva. */}
      {BLOBS.map((blob, index) => {
        const wander = drift(frame, blob.driftAmount, 340 + index * 70, 420 + index * 55, blob.phase);
        const scale = breathe(frame, 260 + index * 90, 0.09, blob.phase);

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: `${blob.x}%`,
              top: `${blob.y}%`,
              width: `${blob.size}%`,
              aspectRatio: '1 / 1',
              transform: `translate(-50%, -50%) translate(${wander.x}px, ${wander.y}px) scale(${scale.toFixed(4)})`,
              background: `radial-gradient(circle, ${blob.color} 0%, transparent 68%)`,
              opacity: blob.opacity * intensity,
            }}
          />
        );
      })}

      {/* 2. Rejilla lejana, grande y tenue. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${theme.color.grid} 1px, transparent 1px),
                            linear-gradient(90deg, ${theme.color.grid} 1px, transparent 1px)`,
          backgroundSize: '240px 240px',
          backgroundPosition: `${gridFar.x}px ${gridFar.y}px`,
          opacity: 0.5 * intensity,
        }}
      />

      {/* 2b. Rejilla cercana, fina y en direccion opuesta: eso es el parallax. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${theme.color.grid} 1px, transparent 1px),
                            linear-gradient(90deg, ${theme.color.grid} 1px, transparent 1px)`,
          backgroundSize: '72px 72px',
          backgroundPosition: `${gridNear.x}px ${gridNear.y}px`,
          opacity: 0.26 * intensity,
        }}
      />

      {/* 3. Grano. Patron de puntos que se desplaza cada frame para que no se
             lea como textura fija. Barato y mata el banding. */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.5) 0.5px, transparent 0.5px)',
          backgroundSize: '3px 3px',
          backgroundPosition: `${(frame * 7) % 3}px ${(frame * 11) % 3}px`,
          opacity: 0.05,
          mixBlendMode: 'overlay',
        }}
      />

      {/* 4. Vineteado, con una respiracion muy lenta. */}
      <AbsoluteFill
        style={{
          // Arranca lejos del centro y no llega a opaco: un vineteado agresivo
          // apaga el contenido de los bordes, que es justo donde suelen estar
          // los nodos de un diagrama.
          background: `radial-gradient(ellipse at 50% 50%, transparent ${(58 + oscillate(frame, 400) * 3).toFixed(1)}%, rgba(11, 14, 20, 0.82) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
