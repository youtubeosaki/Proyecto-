import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme/index';
import { enterUp } from '../theme/animation';
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

const Panel: React.FC<{ side: z.infer<typeof sideSchema>; startFrame: number }> = ({
  side,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enterUp(frame, startFrame, fps);

  const accent =
    side.tone === 'ok' ? theme.color.ok : side.tone === 'danger' ? theme.color.danger : theme.color.accent;

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: theme.color.bgElevated,
        border: `2px solid ${theme.color.grid}`,
        borderTop: `4px solid ${accent}`,
        borderRadius: theme.radius.lg,
        padding: '36px 40px',
        opacity: anim.opacity,
        transform: `translateY(${anim.translateY}px)`,
      }}
    >
      <h3 style={{ margin: '0 0 28px', fontSize: theme.size.subtitle, color: accent, fontWeight: 600 }}>
        {side.heading}
      </h3>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {side.points.map((point, index) => {
          const pointAnim = enterUp(frame, startFrame + 6 + index * 5, fps);
          return (
            <li
              key={index}
              style={{
                fontSize: theme.size.label,
                lineHeight: 1.45,
                color: theme.color.text,
                display: 'flex',
                gap: 14,
                opacity: pointAnim.opacity,
                transform: `translateY(${pointAnim.translateY}px)`,
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

export const SideBySide: React.FC<SideBySideProps> = ({ title, left, right }) => (
  <Frame>
    {title ? (
      <h2 style={{ fontSize: theme.size.subtitle, color: theme.color.text, margin: '0 0 48px', fontWeight: 600 }}>
        {title}
      </h2>
    ) : null}
    <div style={{ display: 'flex', gap: 40, alignItems: 'stretch' }}>
      <Panel side={left} startFrame={0} />
      <Panel side={right} startFrame={8} />
    </div>
  </Frame>
);
