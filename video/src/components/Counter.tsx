import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme/index';
import { enterUp, progressBetween } from '../theme/animation';
import { Frame } from './Frame';

/**
 * Numero grande que cuenta hasta su valor. Para latencias, escala, throughput.
 *
 * La curva es cubica invertida (rapido al principio, frena al final) porque
 * un contador lineal se lee como una barra de carga en vez de como un dato.
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

  const linear = progressBetween(frame, 0, durationInFrames);
  const eased = 1 - (1 - linear) ** 3;
  const value = from + (to - from) * eased;

  const formatted = value
    .toFixed(decimals)
    .replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);

  const labelAnim = enterUp(frame, 0, fps);
  const footAnim = enterUp(frame, durationInFrames - 10, fps);

  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            fontSize: theme.size.subtitle,
            color: theme.color.textMuted,
            opacity: labelAnim.opacity,
            transform: `translateY(${labelAnim.translateY}px)`,
            textAlign: 'center',
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
          }}
        >
          <span style={{ fontSize: 180, fontWeight: 700, color: theme.color.accent, lineHeight: 1 }}>
            {formatted}
          </span>
          {unit ? (
            <span style={{ fontSize: 64, color: theme.color.textMuted }}>{unit}</span>
          ) : null}
        </div>

        {footnote ? (
          <div
            style={{
              marginTop: 16,
              fontSize: theme.size.label,
              color: theme.color.textMuted,
              opacity: footAnim.opacity,
              transform: `translateY(${footAnim.translateY}px)`,
              textAlign: 'center',
              maxWidth: 900,
            }}
          >
            {footnote}
          </div>
        ) : null}
      </div>
    </Frame>
  );
};
