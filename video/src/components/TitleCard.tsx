import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme';
import {
  breathe,
  entranceStyle,
  enterUp,
  oscillate,
  progressBetween,
  staggerWords,
} from '../theme/motion';
import { Frame } from './Frame';

export const titleCardSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  /** Etiqueta pequena sobre el titulo, tipo "CAPITULO 2". */
  eyebrow: z.string().optional(),
});

export type TitleCardProps = z.infer<typeof titleCardSchema>;

export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle, eyebrow }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = staggerWords(title, 6, 2.5);
  const sub = enterUp(frame, 8 + words.length * 2.5, fps);

  // La regla luminosa bajo el eyebrow se estira y luego respira.
  const ruleWidth = progressBetween(frame, 2, 26);

  return (
    <Frame phase={0} zoom={0.05}>
      {eyebrow ? (
        <div style={{ marginBottom: 26 }}>
          <div
            style={{
              fontFamily: theme.font.mono,
              fontSize: theme.size.caption,
              letterSpacing: 5,
              textTransform: 'uppercase',
              color: theme.color.accent,
              opacity: progressBetween(frame, 0, 14),
              transform: `translateX(${((1 - progressBetween(frame, 0, 20)) * -18).toFixed(2)}px)`,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              marginTop: 12,
              height: 2,
              width: `${(ruleWidth * (18 + oscillate(frame, 180) * 1.5)).toFixed(2)}%`,
              background: `linear-gradient(90deg, ${theme.color.accent}, transparent)`,
            }}
          />
        </div>
      ) : null}

      {/* Titulo palabra a palabra: se lee mientras aparece. */}
      <h1
        style={{
          fontSize: theme.size.title,
          fontWeight: 700,
          lineHeight: 1.08,
          margin: 0,
          color: theme.color.text,
          maxWidth: '88%',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0 0.28em',
        }}
      >
        {words.map(({ word, at }, index) => {
          const anim = enterUp(frame, at, fps);
          // Cada palabra respira con fase propia: el bloque no queda estatico.
          const float = oscillate(frame, 220 + index * 13, index) * 1.6;

          return (
            <span
              key={index}
              style={{
                display: 'inline-block',
                ...entranceStyle(anim, `translateY(${float.toFixed(2)}px)`),
              }}
            >
              {word}
            </span>
          );
        })}
      </h1>

      {subtitle ? (
        <p
          style={{
            fontSize: theme.size.subtitle,
            lineHeight: 1.4,
            marginTop: 30,
            marginBottom: 0,
            color: theme.color.textMuted,
            maxWidth: '68%',
            transformOrigin: 'left center',
            ...entranceStyle(sub, `scale(${breathe(frame, 300, 0.004).toFixed(4)})`),
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </Frame>
  );
};
