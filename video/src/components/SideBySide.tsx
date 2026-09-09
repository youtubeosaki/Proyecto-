import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme';
import { breathe, entranceStyle, enterUp, oscillate } from '../theme/motion';
import { Frame } from './Frame';

/** Comparativa de dos enfoques. El formato "asi lo hace mal / asi lo hace bien". */

const sideSchema = z.object({
  heading: z.string(),
  points: z.array(z.string()),
  tone: z.enum(['neutral', 'ok', 'danger']).default('neutral'),
});

export const sideBySideSchema = z.object({
  title: z.string().optional(),
  left: sideSchema,
  right: sideSchema,
});

export type SideBySideProps = z.infer<typeof sideBySideSchema>;

const Panel: React.FC<{ side: z.infer<typeof sideSchema>; startFrame: number; index: number }> = ({
  side,
  startFrame,
  index,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enterUp(frame, startFrame, fps);

  const accent =
    side.tone === 'ok'
      ? theme.color.ok
      : side.tone === 'danger'
        ? theme.color.danger
        : theme.color.accent;

  // Los dos paneles flotan en contrafase: se lee como equilibrio, no como
  // dos cajas quietas.
  const float = oscillate(frame, 260, index * Math.PI) * 5;

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: theme.color.bgElevated,
        border: `2px solid ${theme.color.grid}`,
        borderTop: `4px solid ${accent}`,
        borderRadius: theme.radius.lg,
        padding: '36px 40px',
        boxShadow: `0 18px 60px rgba(0,0,0,0.5), 0 0 ${(30 + oscillate(frame, 190, index) * 10).toFixed(1)}px ${accent}12`,
        ...entranceStyle(
          anim,
          `translateY(${float.toFixed(2)}px) scale(${breathe(frame, 280, 0.005, index * 2).toFixed(4)})`,
        ),
      }}
    >
      <h3
        style={{
          margin: '0 0 28px',
          fontSize: theme.size.subtitle,
          color: accent,
          fontWeight: 600,
        }}
      >
        {side.heading}
      </h3>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {side.points.map((point, i) => {
          const pointAnim = enterUp(frame, startFrame + 8 + i * 5, fps);
          return (
            <li
              key={i}
              style={{
                fontSize: theme.size.label,
                lineHeight: 1.45,
                color: theme.color.text,
                display: 'flex',
                gap: 14,
                ...entranceStyle(pointAnim),
              }}
            >
              <span style={{ color: accent, flexShrink: 0 }}>—</span>
              <span>{point}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const SideBySide: React.FC<SideBySideProps> = ({ title, left, right }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Frame phase={5.1} zoom={0.03}>
      {title ? (
        <h2
          style={{
            fontSize: theme.size.subtitle,
            color: theme.color.text,
            margin: '0 0 48px',
            fontWeight: 600,
            transformOrigin: 'left center',
            ...entranceStyle(enterUp(frame, 0, fps)),
          }}
        >
          {title}
        </h2>
      ) : null}
      <div style={{ display: 'flex', gap: 40, alignItems: 'stretch' }}>
        <Panel side={left} startFrame={4} index={0} />
        <Panel side={right} startFrame={12} index={1} />
      </div>
    </Frame>
  );
};
