import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme/index';
import { progressBetween } from '../theme/animation';
import { Frame } from './Frame';

/**
 * Bloque de codigo con resaltado progresivo de lineas.
 *
 * No hay resaltado de sintaxis por lenguaje a proposito: en video, resaltar
 * QUE linea importa ahora comunica mucho mas que colorear cada keyword.
 * El foco se mueve con la narracion.
 */

export const codeBlockSchema = z.object({
  title: z.string().optional(),
  language: z.string().default('text'),
  /** Una entrada por linea. Sin tabs: se expanden distinto en cada navegador. */
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

export const CodeBlock: React.FC<CodeBlockProps> = ({ title, language, lines, highlights }) => {
  const frame = useCurrentFrame();

  // El ultimo resaltado cuyo startFrame ya paso es el que manda.
  const active = highlights
    .filter((highlight) => frame >= highlight.startFrame)
    .sort((a, b) => b.startFrame - a.startFrame)[0];

  const activeLines = new Set(active?.lines ?? []);
  const hasFocus = activeLines.size > 0;

  return (
    <Frame>
      <div
        style={{
          backgroundColor: theme.color.bgElevated,
          border: `2px solid ${theme.color.grid}`,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
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

        <div style={{ padding: '24px 28px' }}>
          {lines.map((line, index) => {
            const focused = activeLines.has(index);
            const reveal = progressBetween(frame, index * 2, index * 2 + theme.timing.quick);

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  gap: 20,
                  fontFamily: theme.font.mono,
                  fontSize: theme.size.code,
                  lineHeight: 1.65,
                  opacity: reveal * (hasFocus && !focused ? 0.32 : 1),
                  backgroundColor: focused ? 'rgba(77, 163, 255, 0.10)' : 'transparent',
                  borderLeft: `3px solid ${focused ? theme.color.accent : 'transparent'}`,
                  paddingLeft: 14,
                  marginLeft: -17,
                  transition: 'none',
                }}
              >
                <span style={{ color: theme.color.grid, width: 34, textAlign: 'right', flexShrink: 0 }}>
                  {index + 1}
                </span>
                <span style={{ color: focused ? theme.color.text : theme.color.textMuted, whiteSpace: 'pre' }}>
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
            opacity: progressBetween(frame, active.startFrame, active.startFrame + theme.timing.quick),
          }}
        >
          {active.note}
        </div>
      ) : null}
    </Frame>
  );
};
