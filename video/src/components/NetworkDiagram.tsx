import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme/index';
import { enterUp, progressBetween } from '../theme/animation';
import { Frame } from './Frame';

/**
 * Diagrama de red: nodos, enlaces y paquetes que viajan.
 *
 * Es el componente de trabajo pesado del canal. Un handshake TLS, una
 * peticion a un CDN, la replicacion de un commit: todo eso es este componente
 * con distintas props.
 *
 * Las posiciones son porcentajes 0..100 del area util, no pixeles, para que
 * el mismo diagrama sirva en 16:9 y en el 9:16 de los Shorts.
 */

const nodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Posicion en porcentaje del area util. */
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  sublabel: z.string().optional(),
  variant: z.enum(['default', 'accent', 'muted']).default('default'),
});

const packetSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  /** Frame en el que el paquete sale del nodo origen. */
  startFrame: z.number().int().nonnegative(),
  /** Cuanto tarda en llegar. Es la variable con la que se narra la latencia. */
  durationInFrames: z.number().int().positive().default(30),
  tone: z.enum(['accent', 'ok', 'danger', 'warn']).default('accent'),
  /** El paquete se pierde a mitad de camino. Para explicar timeouts y reintentos. */
  drops: z.boolean().default(false),
});

export const networkDiagramSchema = z.object({
  caption: z.string().optional(),
  nodes: z.array(nodeSchema).min(2),
  links: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .default([]),
  packets: z.array(packetSchema).default([]),
});

export type NetworkDiagramProps = z.infer<typeof networkDiagramSchema>;

const NODE_WIDTH = 200;
const NODE_HEIGHT = 92;

export const NetworkDiagram: React.FC<NetworkDiagramProps> = ({
  caption,
  nodes,
  links,
  packets,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Area util dentro del padding del Frame.
  const padding = 96;
  const areaWidth = width - padding * 2;
  const areaHeight = height - padding * 2 - (caption ? 120 : 0);

  const toPx = (node: { x: number; y: number }) => ({
    x: (node.x / 100) * areaWidth,
    y: (node.y / 100) * areaHeight,
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));

  const nodeColor = (variant: 'default' | 'accent' | 'muted'): string =>
    variant === 'accent'
      ? theme.color.accent
      : variant === 'muted'
        ? theme.color.textMuted
        : theme.color.text;

  const toneColor: Record<'accent' | 'ok' | 'danger' | 'warn', string> = {
    accent: theme.color.accent,
    ok: theme.color.ok,
    danger: theme.color.danger,
    warn: theme.color.warn,
  };

  /**
   * Estado de cada paquete en este frame. Se calcula una sola vez porque lo
   * consumen dos capas: los puntos van bajo los nodos y las etiquetas encima.
   * Si una etiqueta queda detras de una caja, el diagrama deja de leerse.
   */
  const activePackets = packets.flatMap((packet, index) => {
    const from = byId.get(packet.from);
    const to = byId.get(packet.to);
    if (!from || !to) return [];

    const travel = progressBetween(
      frame,
      packet.startFrame,
      packet.startFrame + packet.durationInFrames,
    );
    if (travel <= 0) return [];

    // Un paquete que se pierde recorre solo el 55% y se desvanece ahi.
    const dropPoint = 0.55;
    const reached = packet.drops ? Math.min(travel, dropPoint) : travel;
    const lost = packet.drops && travel > dropPoint;

    const a = toPx(from);
    const b = toPx(to);

    const opacity = lost
      ? Math.max(0, 1 - (travel - dropPoint) / 0.2)
      : travel >= 1
        ? Math.max(0, 1 - (travel - 1) * 4)
        : 1;

    if (opacity <= 0) return [];

    return [
      {
        key: `${packet.from}-${packet.to}-${index}`,
        label: packet.label,
        // La etiqueta desaparece al llegar: si no, se queda encima del nodo
        // destino y tapa su nombre.
        showLabel: travel < 0.9,
        x: a.x + (b.x - a.x) * reached,
        y: a.y + (b.y - a.y) * reached,
        originX: a.x,
        originY: a.y,
        opacity,
        color: lost ? theme.color.danger : toneColor[packet.tone],
      },
    ];
  });

  return (
    <Frame>
      <div style={{ position: 'relative', width: areaWidth, height: areaHeight }}>
        <svg
          width={areaWidth}
          height={areaHeight}
          style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        >
          {/* Enlaces: se dibujan primero para quedar detras de todo. */}
          {links.map((link, index) => {
            const from = byId.get(link.from);
            const to = byId.get(link.to);
            if (!from || !to) return null;

            const a = toPx(from);
            const b = toPx(to);
            // Los enlaces se dibujan progresivamente, escalonados, para que
            // la topologia se lea en orden en vez de aparecer de golpe.
            const draw = progressBetween(frame, index * 4, index * 4 + theme.timing.slow);

            return (
              <line
                key={`${link.from}-${link.to}`}
                x1={a.x}
                y1={a.y}
                x2={a.x + (b.x - a.x) * draw}
                y2={a.y + (b.y - a.y) * draw}
                stroke={theme.color.grid}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}

          {/* Cuerpo del paquete: bajo los nodos, para que "entre" en la caja. */}
          {activePackets.map((packet) => (
            <g key={packet.key} opacity={packet.opacity}>
              {/* Estela: comunica direccion sin necesidad de flecha. */}
              <line
                x1={packet.originX + (packet.x - packet.originX) * 0.82}
                y1={packet.originY + (packet.y - packet.originY) * 0.82}
                x2={packet.x}
                y2={packet.y}
                stroke={packet.color}
                strokeWidth={4}
                strokeLinecap="round"
                opacity={0.35}
              />
              <circle cx={packet.x} cy={packet.y} r={22} fill={packet.color} opacity={0.18} />
              <circle cx={packet.x} cy={packet.y} r={12} fill={packet.color} />
            </g>
          ))}
        </svg>

        {/* Nodos, como divs para poder usar tipografia normal. */}
        {nodes.map((node, index) => {
          const { x, y } = toPx(node);
          const anim = enterUp(frame, index * 3, fps);
          const color = nodeColor(node.variant);

          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: x - NODE_WIDTH / 2,
                top: y - NODE_HEIGHT / 2,
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
                padding: '14px 18px',
                boxSizing: 'border-box',
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.bgElevated,
                border: `2px solid ${node.variant === 'accent' ? theme.color.accent : theme.color.grid}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                opacity: anim.opacity,
                transform: `translateY(${anim.translateY}px)`,
              }}
            >
              <div
                style={{
                  fontSize: theme.size.label,
                  fontWeight: 600,
                  color,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {node.label}
              </div>
              {node.sublabel ? (
                <div
                  style={{
                    fontFamily: theme.font.mono,
                    fontSize: 16,
                    color: theme.color.textMuted,
                    textAlign: 'center',
                  }}
                >
                  {node.sublabel}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Etiquetas de paquete: capa superior, siempre legibles. */}
        {activePackets.map((packet) =>
          packet.label && packet.showLabel ? (
            <div
              key={`label-${packet.key}`}
              style={{
                position: 'absolute',
                left: packet.x,
                top: packet.y - 52,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                fontFamily: theme.font.mono,
                fontSize: theme.size.caption,
                color: packet.color,
                opacity: packet.opacity,
                backgroundColor: theme.color.bg,
                padding: '4px 10px',
                borderRadius: theme.radius.sm,
              }}
            >
              {packet.label}
            </div>
          ) : null,
        )}
      </div>

      {caption ? (
        <div
          style={{
            marginTop: 48,
            fontSize: theme.size.label,
            color: theme.color.textMuted,
            textAlign: 'center',
            opacity: progressBetween(frame, 6, 6 + theme.timing.normal),
          }}
        >
          {caption}
        </div>
      ) : null}
    </Frame>
  );
};
