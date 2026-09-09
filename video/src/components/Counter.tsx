import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme';
import {
  breathe,
  easeOutQuint,
  entranceStyle,
  enterUp,
  oscillate,
  popIn,
  progressBetween,
} from '../theme/motion';
import { Frame } from './Frame';

/**
 * Numero grande que cuenta hasta su valor. Para latencias, escala, throughput.
 *
 * La curva es quintica invertida porque un contador lineal se lee como una
 * barra de carga en vez de como un dato que se revela.
 */

export const counterSchema = z.object({
  label: z.string(),
  from: z.number().default(0),
  to: z.number(),
  /** Se pega al numero: "ms", "req/s", "%". */
  unit: z.string().default(''),
  decimals: z.number().int().min(0).max(4).default(0),
  /** Separador de miles. Deja vacio para desactivarlo. */
  thousandsSeparator: z.string().default('.'),
  footnote: z.string().optional(),
  durationInFrames: z.number().int().positive().default(45),
});

export type CounterProps = z.infer<typeof counterSchema>;

export const Counter: React.FC<CounterProps> = ({
  label,
  from,
  to,
  unit,
  decimals,
  thousandsSeparator,
  footnote,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const t = easeOutQuint(progressBetween(frame, 6, 6 + durationInFrames));
  const value = from + (to - from) * t;

  const formatted = value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);

  const labelAnim = enterUp(frame, 0, fps);
  const numberAnim = popIn(frame, 6, fps);
  const footAnim = enterUp(frame, 6 + durationInFrames - 6, fps);

  // Al terminar de contar, el numero da un golpe de escala y de brillo.
  const settle = progressBetween(frame, 6 + durationInFrames - 4, 6 + durationInFrames + 14);
  const impact = Math.sin(settle * Math.PI) ** 2;

  const glow = 40 + impact * 90 + oscillate(frame, 170) * 8;

  return (
    <Frame phase={3.9} zoom={0.055}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div
          style={{
            fontSize: theme.size.subtitle,
            color: theme.color.textMuted,
            textAlign: 'center',
            maxWidth: 1200,
            ...entranceStyle(labelAnim),
          }}
        >
          {label}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 16,
            fontFamily: theme.font.mono,
            ...entranceStyle(
              numberAnim,
              `scale(${(breathe(frame, 210, 0.012) * (1 + impact * 0.06)).toFixed(4)})`,
            ),
          }}
        >
          <span
            style={{
              fontSize: 190,
              fontWeight: 700,
              color: theme.color.accent,
              lineHeight: 1,
              textShadow: `0 0 ${glow.toFixed(1)}px ${theme.color.accent}66`,
              // Ancho tabular: sin esto el numero tiembla al cambiar de digito.
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatted}
          </span>
          {unit ? (
            <span style={{ fontSize: 66, color: theme.color.textMuted }}>{unit}</span>
          ) : null}
        </div>

        {footnote ? (
          <div
            style={{
              marginTop: 18,
              fontSize: theme.size.label,
              lineHeight: 1.5,
              color: theme.color.textMuted,
              textAlign: 'center',
              maxWidth: 980,
              borderTop: `1px solid ${theme.color.grid}`,
              paddingTop: 22,
              ...entranceStyle(footAnim),
            }}
          >
            {footnote}
          </div>
        ) : null}
      </div>
    </Frame>
  );
};
