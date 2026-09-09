import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme';
import {
  breathe,
  entranceStyle,
  enterUp,
  oscillate,
  popIn,
  progressBetween,
  pulse,
} from '../theme/motion';
import { Frame } from './Frame';

/** Linea de tiempo horizontal. Para protocolos por pasos y cronologias. */

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
  // El riel avanza en lineal y llega exactamente cuando aparece el ultimo
  // evento. Con una curva suavizada la cabeza corre por delante y deja un
  // hueco que se lee como un evento que falta.
  const rail = progressBetween(frame, 0, lastFrame);

  // Cabeza luminosa que avanza por delante del riel mientras se dibuja.
  const railHeadVisible = rail > 0.01 && rail < 0.995;

  const titleAnim = enterUp(frame, 0, fps);

  return (
    <Frame phase={2.6} zoom={0.03}>
      {title ? (
        <h2
          style={{
            fontSize: theme.size.subtitle,
            color: theme.color.text,
            margin: '0 0 84px',
            fontWeight: 600,
            transformOrigin: 'left center',
            ...entranceStyle(titleAnim, `translateY(${(oscillate(frame, 250) * 2).toFixed(2)}px)`),
          }}
        >
          {title}
        </h2>
      ) : null}

      <div style={{ position: 'relative', paddingTop: 40 }}>
        {/* Riel base tenue: da contexto de cuanto queda por recorrer. */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            right: 0,
            height: 4,
            backgroundColor: theme.color.grid,
            opacity: 0.35,
            borderRadius: 2,
          }}
        />

        {/* Riel que avanza, con degradado hacia el color de acento. */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            height: 4,
            width: `${(rail * 100).toFixed(2)}%`,
            background: `linear-gradient(90deg, ${theme.color.accent}55, ${theme.color.accent})`,
            borderRadius: 2,
          }}
        />

        {railHeadVisible ? (
          <div
            style={{
              position: 'absolute',
              top: 42,
              left: `${(rail * 100).toFixed(2)}%`,
              width: 12,
              height: 12,
              marginLeft: -6,
              marginTop: -6,
              borderRadius: '50%',
              backgroundColor: theme.color.accent,
              boxShadow: `0 0 24px 6px ${theme.color.accent}88`,
            }}
          />
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
          {events.map((event, index) => {
            const anim = popIn(frame, event.atFrame, fps);
            const color = tones[event.tone];
            const flash = pulse(frame, event.atFrame, 26);
            const float = oscillate(frame, 230 + index * 29, index * 1.4) * 2.5;

            return (
              <div
                key={index}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  ...entranceStyle(anim, `translateY(${float.toFixed(2)}px)`),
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: color,
                    marginTop: -9,
                    boxShadow: `0 0 0 8px ${theme.color.bg}, 0 0 ${(34 * flash + 8).toFixed(1)}px ${(8 * flash).toFixed(1)}px ${color}${flash > 0.02 ? 'AA' : '33'}`,
                    transform: `scale(${(1 + flash * 0.45).toFixed(3)})`,
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
                      transform: `scale(${breathe(frame, 200 + index * 23, 0.012, index).toFixed(4)})`,
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
