import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme/index';
import { enterUp, progressBetween } from '../theme/animation';
import { Frame } from './Frame';

/**
 * Linea de tiempo horizontal. Para protocolos por pasos y cronologias.
 */

export const timelineSchema = z.object({
  title: z.string().optional(),
  events: z
    .array(
      z.object({
        label: z.string(),
        /** Momento en el que aparece, en frames desde el inicio de la escena. */
        atFrame: z.number().int().nonnegative(),
        detail: z.string().optional(),
        tone: z.enum(['accent', 'ok', 'danger', 'warn']).default('accent'),
      }),
    )
    .min(1),
});

export type TimelineProps = z.infer<typeof timelineSchema>;

export const Timeline: React.FC<TimelineProps> = ({ title, events }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tones = {
    accent: theme.color.accent,
    ok: theme.color.ok,
    danger: theme.color.danger,
    warn: theme.color.warn,
  } as const;

  const lastFrame = Math.max(...events.map((event) => event.atFrame), 1);
  const lineProgress = progressBetween(frame, 0, lastFrame + theme.timing.normal);

  return (
    <Frame>
      {title ? (
        <h2
          style={{
            fontSize: theme.size.subtitle,
            color: theme.color.text,
            margin: '0 0 72px',
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
      ) : null}

      <div style={{ position: 'relative', paddingTop: 40 }}>
        {/* El riel crece de izquierda a derecha conforme avanzan los eventos. */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            height: 4,
            width: `${lineProgress * 100}%`,
            backgroundColor: theme.color.grid,
            borderRadius: 2,
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
          {events.map((event, index) => {
            const anim = enterUp(frame, event.atFrame, fps);
            const color = tones[event.tone];

            return (
              <div
                key={index}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  opacity: anim.opacity,
                  transform: `translateY(${anim.translateY}px)`,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: color,
                    marginTop: -9,
                    boxShadow: `0 0 0 8px ${theme.color.bg}`,
                  }}
                />
                <div
                  style={{
                    marginTop: 28,
                    fontSize: theme.size.label,
                    color: theme.color.text,
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                >
                  {event.label}
                </div>
                {event.detail ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontFamily: theme.font.mono,
                      fontSize: 17,
                      color: theme.color.textMuted,
                      textAlign: 'center',
                    }}
                  >
                    {event.detail}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
};
