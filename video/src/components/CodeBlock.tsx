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
  pulse,
} from '../theme/motion';
import { Frame } from './Frame';

/**
 * Bloque de codigo con resaltado progresivo de lineas.
 *
 * No hay resaltado de sintaxis por lenguaje a proposito: en video, resaltar
 * QUE linea importa ahora comunica mucho mas que colorear cada keyword. El
 * foco se mueve con la narracion.
 */

export const codeBlockSchema = z.object({
  title: z.string().optional(),
  language: z.string().default('text'),
  /** Una entrada por linea. Sin tabs: se expanden distinto en cada motor. */
  lines: z.array(z.string()),
  /**
   * Que lineas resaltar y desde que frame. Indices basados en 0.
   * El resto del bloque se atenua mientras tanto.
   */
  highlights: z
    .array(
      z.object({
        lines: z.array(z.number().int().nonnegative()),
        startFrame: z.number().int().nonnegative(),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

export type CodeBlockProps = z.infer<typeof codeBlockSchema>;

const LINE_HEIGHT = 40;

export const CodeBlock: React.FC<CodeBlockProps> = ({ title, language, lines, highlights }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // El ultimo resaltado cuyo startFrame ya paso es el que manda.
  const active = highlights
    .filter((highlight) => frame >= highlight.startFrame)
    .sort((a, b) => b.startFrame - a.startFrame)[0];

  const activeLines = new Set(active?.lines ?? []);
  const hasFocus = activeLines.size > 0;
  const focusFlash = active ? pulse(frame, active.startFrame, 20) : 0;

  const panel = enterUp(frame, 0, fps);

  return (
    <Frame phase={4.4} zoom={0.038}>
      <div
        style={{
          backgroundColor: theme.color.bgElevated,
          border: `2px solid ${theme.color.grid}`,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          ...entranceStyle(panel, `scale(${breathe(frame, 300, 0.004).toFixed(4)})`),
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 28px',
            borderBottom: `2px solid ${theme.color.grid}`,
          }}
        >
          <span style={{ fontSize: theme.size.label, color: theme.color.text, fontWeight: 600 }}>
            {title ?? ''}
          </span>
          <span
            style={{
              fontFamily: theme.font.mono,
              fontSize: 18,
              color: theme.color.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            {language}
          </span>
        </div>

        <div style={{ padding: '24px 28px', position: 'relative' }}>
          {/* Banda de foco que se DESLIZA entre bloques resaltados en vez de
              saltar. Ese deslizamiento es lo que guia el ojo. */}
          {hasFocus ? (
            <div
              style={{
                position: 'absolute',
                left: 11,
                right: 28,
                top: 24 + Math.min(...activeLines) * LINE_HEIGHT,
                height: activeLines.size * LINE_HEIGHT,
                background: `linear-gradient(90deg, ${theme.color.accent}22, ${theme.color.accent}08)`,
                borderLeft: `3px solid ${theme.color.accent}`,
                borderRadius: 4,
                boxShadow: `0 0 ${(30 * focusFlash + 6).toFixed(1)}px ${theme.color.accent}${focusFlash > 0.05 ? '55' : '22'}`,
              }}
            />
          ) : null}

          {lines.map((line, index) => {
            const focused = activeLines.has(index);
            const reveal = progressBetween(frame, index * 2, index * 2 + 12);

            return (
              <div
                key={index}
                style={{
                  position: 'relative',
                  display: 'flex',
                  gap: 20,
                  height: LINE_HEIGHT,
                  alignItems: 'center',
                  fontFamily: theme.font.mono,
                  fontSize: theme.size.code,
                  opacity: reveal * (hasFocus && !focused ? 0.3 : 1),
                  transform: `translateX(${((1 - reveal) * 14).toFixed(2)}px)`,
                }}
              >
                <span
                  style={{
                    color: focused ? theme.color.accent : theme.color.grid,
                    width: 34,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </span>
                <span
                  style={{
                    color: focused ? theme.color.text : theme.color.textMuted,
                    whiteSpace: 'pre',
                  }}
                >
                  {line || ' '}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {active?.note ? (
        <div
          style={{
            marginTop: 32,
            fontSize: theme.size.label,
            color: theme.color.accent,
            ...entranceStyle(
              enterUp(frame, active.startFrame, fps),
              `translateY(${(oscillate(frame, 210) * 2).toFixed(2)}px)`,
            ),
          }}
        >
          {active.note}
        </div>
      ) : null}
    </Frame>
  );
};
