import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme/index';
import { enterUp, fadeIn } from '../theme/animation';
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

  const heading = enterUp(frame, 0, fps);
  const sub = enterUp(frame, 10, fps);

  return (
    <Frame>
      {eyebrow ? (
        <div
          style={{
            fontFamily: theme.font.mono,
            fontSize: theme.size.caption,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: theme.color.accent,
            opacity: fadeIn(frame, 0, theme.timing.quick),
            marginBottom: 20,
          }}
        >
          {eyebrow}
        </div>
      ) : null}

      <h1
        style={{
          fontSize: theme.size.title,
          fontWeight: 700,
          lineHeight: 1.1,
          margin: 0,
          color: theme.color.text,
          opacity: heading.opacity,
          transform: `translateY(${heading.translateY}px)`,
          maxWidth: '85%',
        }}
      >
        {title}
      </h1>

      {subtitle ? (
        <p
          style={{
            fontSize: theme.size.subtitle,
            lineHeight: 1.4,
            marginTop: 28,
            marginBottom: 0,
            color: theme.color.textMuted,
            opacity: sub.opacity,
            transform: `translateY(${sub.translateY}px)`,
            maxWidth: '70%',
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </Frame>
  );
};
