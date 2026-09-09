import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { theme } from '../theme';
import {
  breathe,
  entranceStyle,
  enterUp,
  easeOutCubic,
  oscillate,
  progressBetween,
  pulse,
} from '../theme/motion';
import { Frame } from './Frame';
import { useSceneSize } from './SceneSize';
import { OkiStage, type OkiBeat } from './mascot/OkiStage';
import type { OkiExpression } from './mascot/identity';

/**
 * Diagrama de red: nodos, enlaces y paquetes que viajan.
 *
 * Es el componente de trabajo pesado del canal. Un handshake TLS, una peticion
 * a un CDN, la replicacion de un commit: todo eso es este componente con
 * distintas props.
 *
 * Las posiciones son porcentajes 0..100 del area util, no pixeles, para que el
 * mismo diagrama sirva en 16:9 y en el 9:16 de los Shorts.
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

/**
 * Coreografia de Oki dentro del diagrama.
 *
 * Los beats referencian NODOS y PAQUETES por su identificador, no coordenadas.
 * Esa es la pieza que hace que la interaccion sea real: si se mueve un nodo,
 * Oki se mueve con el, y si un paquete cambia de velocidad, Oki lo sigue
 * igual. Una coreografia escrita en pixeles se desincroniza al primer
 * retoque del diagrama.
 */
const guideBeatSchema = z.object({
  atFrame: z.number().int().nonnegative(),
  /** Junto a que nodo se coloca. */
  atNode: z.string().optional(),
  /** O bien acompaña a un paquete mientras viaja, por su indice. */
  followPacket: z.number().int().nonnegative().optional(),
  /** A que nodo mira. Si `point`, ademas lo señala. */
  lookAtNode: z.string().optional(),
  lookAtPacket: z.number().int().nonnegative().optional(),
  point: z.boolean().default(false),
  expression: z
    .enum(['neutral', 'curious', 'thinking', 'surprised', 'happy', 'focused'])
    .default('neutral'),
  travelFrames: z.number().int().positive().optional(),
});

export const networkDiagramSchema = z.object({
  caption: z.string().optional(),
  nodes: z.array(nodeSchema).min(2),
  links: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  packets: z.array(packetSchema).default([]),
  /** Si se omite, el diagrama se dibuja sin personaje. */
  guide: z
    .object({
      size: z.number().positive().default(230),
      seed: z.number().int().nonnegative().default(4),
      beats: z.array(guideBeatSchema).min(1),
    })
    .optional(),
});

export type NetworkDiagramProps = z.input<typeof networkDiagramSchema>;

const NODE_WIDTH = 200;
const NODE_HEIGHT = 92;
/** Cuantos fantasmas deja el paquete detras. La estela hace legible la direccion. */
const TRAIL_LENGTH = 7;

export const NetworkDiagram: React.FC<NetworkDiagramProps> = ({
  caption,
  nodes,
  links = [],
  packets = [],
  guide,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // El lienzo LOGICO, no el de la composicion: en un Short no coinciden.
  const { width, height } = useSceneSize();

  const padding = 96;
  const areaWidth = width - padding * 2;
  const areaHeight = height - padding * 2 - (caption ? 120 : 0);

  const toPx = (node: { x: number; y: number }) => ({
    x: (node.x / 100) * areaWidth,
    y: (node.y / 100) * areaHeight,
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));

  const toneColor = {
    accent: theme.color.accent,
    ok: theme.color.ok,
    danger: theme.color.danger,
    warn: theme.color.warn,
  } as const;

  /**
   * Posicion de un paquete en CUALQUIER frame, no solo en el actual.
   *
   * Se extrae como funcion pura porque tiene dos consumidores: el dibujo del
   * paquete y la coreografia de Oki, que necesita preguntar "donde estara
   * este paquete" para acompañarlo. Duplicar la formula en los dos sitios
   * seria la via directa a que se desincronicen.
   */
  const packetStateAt = (index: number, atFrame: number) => {
    const packet = packets[index];
    if (!packet) return null;

    const from = byId.get(packet.from);
    const to = byId.get(packet.to);
    if (!from || !to) return null;

    const duration = packet.durationInFrames ?? 30;
    const drops = packet.drops ?? false;

    const linear = progressBetween(atFrame, packet.startFrame, packet.startFrame + duration);
    if (linear <= 0) return null;

    // Acelera al salir y frena al llegar: un paquete a velocidad constante se
    // lee como un objeto arrastrado, no como algo que se lanza.
    const travel = easeOutCubic(linear);

    const dropPoint = 0.55;
    const reached = drops ? Math.min(travel, dropPoint) : travel;
    const lost = drops && travel > dropPoint;

    const a = toPx(from);
    const b = toPx(to);

    const opacity = lost
      ? Math.max(0, 1 - (travel - dropPoint) / 0.2)
      : travel >= 1
        ? Math.max(0, 1 - (travel - 1) * 4)
        : 1;

    const at = (p: number) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });

    return {
      packet,
      origin: a,
      head: at(reached),
      at,
      reached,
      travel,
      lost,
      opacity,
      arrivalFrame: packet.startFrame + duration,
      color: lost ? theme.color.danger : toneColor[packet.tone ?? 'accent'],
    };
  };

  const activePackets = packets.flatMap((packet, index) => {
    const state = packetStateAt(index, frame);
    if (!state || state.opacity <= 0) return [];

    return [
      {
        key: `${packet.from}-${packet.to}-${index}`,
        label: packet.label,
        x: state.head.x,
        y: state.head.y,
        // Estela: posiciones anteriores del paquete, no una simple linea recta.
        trail: Array.from({ length: TRAIL_LENGTH }, (_, i) => {
          const back = Math.max(0, state.reached - (i + 1) * 0.022);
          return { ...state.at(back), alpha: (1 - (i + 1) / (TRAIL_LENGTH + 1)) * 0.55 };
        }),
        // La etiqueta desaparece al llegar: si no, se queda encima del nodo
        // destino y tapa su nombre.
        showLabel: state.travel < 0.9,
        arrivalFrame: state.arrivalFrame,
        targetId: packet.to,
        opacity: state.opacity,
        color: state.color,
        lost: state.lost,
      },
    ];
  });

  /**
   * Traduce la coreografia declarativa a beats del escenario.
   *
   * Aqui es donde "junto al nodo resolver" se convierte en coordenadas, y
   * donde "acompaña al paquete 2" se convierte en una funcion del frame.
   */
  const guideBeats: OkiBeat[] = (guide?.beats ?? []).map((beat) => {
    const size = guide?.size ?? 230;
    /** Se coloca por debajo del nodo para no taparlo. */
    const besideNode = (id: string) => {
      const node = byId.get(id);
      if (!node) return { x: areaWidth / 2, y: areaHeight / 2 };
      const point = toPx(node);
      return { x: point.x, y: point.y + NODE_HEIGHT / 2 + size * 0.44 };
    };

    const position: OkiBeat['position'] =
      beat.followPacket !== undefined
        ? (atFrame: number) => {
            const state = packetStateAt(beat.followPacket!, atFrame);
            // Antes de que salga el paquete, espera en su origen.
            const anchor =
              state?.head ?? packetStateAt(beat.followPacket!, 0)?.origin ?? { x: areaWidth / 2, y: areaHeight / 2 };
            return { x: anchor.x, y: anchor.y + size * 0.42 };
          }
        : besideNode(beat.atNode ?? nodes[0]!.id);

    let lookAt: OkiBeat['lookAt'];
    if (beat.lookAtNode) {
      const node = byId.get(beat.lookAtNode);
      if (node) lookAt = toPx(node);
    } else if (beat.lookAtPacket !== undefined) {
      lookAt = (atFrame: number) =>
        packetStateAt(beat.lookAtPacket!, atFrame)?.head ?? { x: areaWidth / 2, y: areaHeight / 2 };
    }

    return {
      atFrame: beat.atFrame,
      position,
      lookAt,
      pointing: beat.point ?? false,
      expression: (beat.expression ?? 'neutral') as OkiExpression,
      travelFrames: beat.travelFrames,
    };
  });

  /** Un nodo destella cuando algo le llega. Da causalidad al diagrama. */
  const arrivalGlow = (nodeId: string): number =>
    activePackets
      .filter((packet) => packet.targetId === nodeId && !packet.lost)
      .reduce((max, packet) => Math.max(max, pulse(frame, packet.arrivalFrame, 22)), 0);

  return (
    <Frame phase={1.3} zoom={0.035}>
      <div style={{ position: 'relative', width: areaWidth, height: areaHeight }}>
        <svg
          width={areaWidth}
          height={areaHeight}
          style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        >
          {links.map((link, index) => {
            const from = byId.get(link.from);
            const to = byId.get(link.to);
            if (!from || !to) return null;

            const a = toPx(from);
            const b = toPx(to);
            const draw = easeOutCubic(progressBetween(frame, index * 5, index * 5 + 34));
            if (draw <= 0) return null;

            const endX = a.x + (b.x - a.x) * draw;
            const endY = a.y + (b.y - a.y) * draw;

            // Luz que recorre el enlace en bucle: comunica "este canal existe
            // y esta activo" incluso cuando no viaja ningun paquete.
            const sheen = (frame / 190 + index * 0.33) % 1;
            const sheenX = a.x + (b.x - a.x) * sheen;
            const sheenY = a.y + (b.y - a.y) * sheen;
            const sheenAlpha = Math.sin(sheen * Math.PI) * 0.4 * draw;

            return (
              <g key={`${link.from}-${link.to}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={endX}
                  y2={endY}
                  stroke={theme.color.line}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <circle cx={sheenX} cy={sheenY} r={5} fill={theme.color.accent} opacity={sheenAlpha} />
              </g>
            );
          })}

          {/* Estela y cuerpo del paquete, bajo los nodos para que "entren". */}
          {activePackets.map((packet) => (
            <g key={packet.key} opacity={packet.opacity}>
              {packet.trail.map((point, i) => (
                <circle
                  key={i}
                  cx={point.x}
                  cy={point.y}
                  r={11 - i * 1.15}
                  fill={packet.color}
                  opacity={point.alpha}
                />
              ))}
              <circle cx={packet.x} cy={packet.y} r={30} fill={packet.color} opacity={0.14} />
              <circle cx={packet.x} cy={packet.y} r={19} fill={packet.color} opacity={0.22} />
              <circle cx={packet.x} cy={packet.y} r={11} fill={packet.color} />
              <circle cx={packet.x} cy={packet.y} r={5} fill="#FFFFFF" opacity={0.85} />
            </g>
          ))}
        </svg>

        {/* Nodos, como divs para poder usar tipografia normal. */}
        {nodes.map((node, index) => {
          const { x, y } = toPx(node);
          const anim = enterUp(frame, index * 4, fps);
          const glow = arrivalGlow(node.id);

          // Respiracion propia por nodo. Fases distintas: si respiraran a la
          // vez, el diagrama entero pareceria latir y se notaria el truco.
          const scale = breathe(frame, 190 + index * 37, 0.008, index * 1.9);
          const float = oscillate(frame, 240 + index * 41, index) * 3;

          const accent = node.variant === 'accent' ? theme.color.accent : theme.color.line;
          const color =
            node.variant === 'accent'
              ? theme.color.accent
              : node.variant === 'muted'
                ? theme.color.textMuted
                : theme.color.text;

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
                border: `2px solid ${glow > 0.05 ? theme.color.ok : accent}`,
                boxShadow:
                  glow > 0.02
                    ? `0 0 ${(46 * glow).toFixed(1)}px ${(10 * glow).toFixed(1)}px rgba(63, 214, 140, ${(0.45 * glow).toFixed(3)})`
                    : `0 12px 40px rgba(0, 0, 0, 0.45)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                ...entranceStyle(anim, `translateY(${float.toFixed(2)}px) scale(${scale.toFixed(4)})`),
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

        {/* Oki, en el espacio de coordenadas del diagrama. Al vivir aqui
            dentro comparte la transformacion de camara con el resto de la
            escena, que es lo que hace que se lea como parte del plano y no
            como una capa pegada encima. */}
        {guideBeats.length > 0 ? (
          <OkiStage
            width={areaWidth}
            height={areaHeight}
            beats={guideBeats}
            size={guide?.size ?? 230}
            seed={guide?.seed ?? 4}
          />
        ) : null}

        {/* Etiquetas de paquete: capa superior, siempre legibles. */}
        {activePackets.map((packet) =>
          packet.label && packet.showLabel ? (
            <div
              key={`label-${packet.key}`}
              style={{
                position: 'absolute',
                left: packet.x,
                top: packet.y - 54,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                fontFamily: theme.font.mono,
                fontSize: theme.size.caption,
                color: packet.color,
                opacity: packet.opacity,
                backgroundColor: 'rgba(11, 14, 20, 0.88)',
                border: `1px solid ${packet.color}44`,
                padding: '5px 12px',
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
            ...entranceStyle(enterUp(frame, 12, fps)),
          }}
        >
          {caption}
        </div>
      ) : null}
    </Frame>
  );
};
