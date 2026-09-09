import type React from 'react';
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming, springTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { TitleCard } from '../components/TitleCard';
import { NetworkDiagram } from '../components/NetworkDiagram';
import { Timeline } from '../components/Timeline';
import { Counter } from '../components/Counter';
import { Oki } from '../components/mascot/Oki';
import { OkiCorner } from '../components/mascot/OkiCorner';
import { theme } from '../theme';

/**
 * Composicion de prueba de la Fase 1.
 *
 * Contenido: que pasa cuando escribes una URL, resumido a 30 segundos. No es
 * un video del canal: es la prueba de que el motor renderiza, de que los
 * componentes comparten identidad visual y de que hay movimiento continuo.
 * En la Fase 3 este ensamblado lo genera el storyboard a partir del guion, no
 * una mano escribiendo <TransitionSeries> a mano.
 *
 * Las transiciones no son decorativas: un corte seco entre dos planos fijos es
 * exactamente lo que hace que un video parezca una presentacion. Cada
 * transicion aqui empuja en la direccion del contenido que llega.
 *
 * Los datos son reales y verificables (RFC 8446 para el 1-RTT de TLS 1.3),
 * porque hasta el video de prueba cumple la regla de la fuente.
 */

const FPS = theme.timing.fps;
const s = (seconds: number): number => Math.round(seconds * FPS);

/** Duracion de cada escena SIN contar el solape de las transiciones. */
const SCENE_FRAMES = [s(5.5), s(10), s(8), s(7.5)] as const;
const TRANSITION_FRAMES = [s(0.7), s(0.6), s(0.7)] as const;

/**
 * TransitionSeries solapa las escenas, asi que la duracion total es la suma
 * de las escenas MENOS la suma de las transiciones. Calcularlo en vez de
 * escribir un numero a mano evita que un cambio de ritmo deje frames negros
 * al final.
 */
export const DEMO_DURATION_IN_FRAMES =
  SCENE_FRAMES.reduce((total, frames) => total + frames, 0) -
  TRANSITION_FRAMES.reduce((total, frames) => total + frames, 0);

/** Cierre a negro en el ultimo medio segundo. Un corte en seco al final se nota. */
const FinalFade: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [DEMO_DURATION_IN_FRAMES - s(0.6), DEMO_DURATION_IN_FRAMES],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return <AbsoluteFill style={{ backgroundColor: '#000', opacity, pointerEvents: 'none' }} />;
};

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
    {/*
      Cama sonora generada por tools/make-ambient-bed.mjs. Audio original, sin
      riesgo de Content ID. Volumen bajo con entrada y salida propias: cuando
      haya narracion, esta pista baja otros 6 dB.
    */}
    <Audio
      src={staticFile('ambient-bed.wav')}
      volume={(frame) =>
        interpolate(
          frame,
          [0, s(2), DEMO_DURATION_IN_FRAMES - s(2.5), DEMO_DURATION_IN_FRAMES],
          [0, 0.32, 0.32, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
      }
    />

    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[0]}>
        <AbsoluteFill>
          <TitleCard
            eyebrow="Prueba de motor"
            title="Que pasa cuando escribes una URL"
            subtitle="Cuatro viajes de ida y vuelta antes de que veas un solo pixel."
          />
          {/* Oki presenta. Entra despues del titulo para no competir con el
              texto en el unico momento en que el texto es el mensaje. */}
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'row',
              // Abajo a la derecha: el titulo llega casi al borde derecho y
              // centrado verticalmente Oki le comia la ultima palabra.
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              paddingRight: 150,
              paddingBottom: 70,
            }}
          >
            <Oki expression="curious" size={285} startFrame={s(1.4)} seed={2} gazeX={-0.5} gazeY={-0.3} />
          </AbsoluteFill>
        </AbsoluteFill>
      </TransitionSeries.Sequence>

      {/* Del titulo al diagrama: empuja hacia arriba, como pasar de pagina. */}
      <TransitionSeries.Transition
        presentation={slide({ direction: 'from-bottom' })}
        timing={springTiming({
          config: { damping: 200, mass: 0.6 },
          durationInFrames: TRANSITION_FRAMES[0],
        })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[1]}>
        <NetworkDiagram
          caption="El navegador no sabe donde esta el servidor. Primero pregunta."
          nodes={[
            { id: 'browser', label: 'Navegador', sublabel: 'tu maquina', x: 13, y: 64, variant: 'accent' },
            { id: 'resolver', label: 'Resolver DNS', sublabel: '1.1.1.1', x: 50, y: 20, variant: 'default' },
            { id: 'server', label: 'Servidor', sublabel: '104.16.x.x', x: 87, y: 64, variant: 'default' },
          ]}
          links={[
            { from: 'browser', to: 'resolver' },
            { from: 'resolver', to: 'server' },
            { from: 'browser', to: 'server' },
          ]}
          packets={[
            { from: 'browser', to: 'resolver', label: 'A? ejemplo.com', startFrame: s(1), durationInFrames: s(1.4), tone: 'accent', drops: false },
            { from: 'resolver', to: 'browser', label: '104.16.x.x', startFrame: s(2.6), durationInFrames: s(1.4), tone: 'ok', drops: false },
            { from: 'browser', to: 'server', label: 'SYN', startFrame: s(4.4), durationInFrames: s(1.2), tone: 'accent', drops: false },
            { from: 'server', to: 'browser', label: 'SYN-ACK', startFrame: s(5.8), durationInFrames: s(1.2), tone: 'ok', drops: false },
            { from: 'browser', to: 'server', label: 'ACK + ClientHello', startFrame: s(7.2), durationInFrames: s(1.2), tone: 'accent', drops: false },
          ]}
        />
        <OkiCorner expression="focused" startFrame={s(2)} seed={5} size={150} />
      </TransitionSeries.Sequence>

      {/* Del diagrama a la cronologia: barrido lateral, el gesto del tiempo. */}
      <TransitionSeries.Transition
        presentation={wipe({ direction: 'from-left' })}
        timing={linearTiming({ durationInFrames: TRANSITION_FRAMES[1] })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[2]}>
        <Timeline
          title="Los viajes que nadie ve"
          events={[
            { label: 'DNS', atFrame: s(0.5), detail: '~20 ms', tone: 'accent' },
            { label: 'TCP', atFrame: s(1.7), detail: '1 RTT', tone: 'accent' },
            { label: 'TLS 1.3', atFrame: s(2.9), detail: '1 RTT', tone: 'warn' },
            { label: 'HTTP GET', atFrame: s(4.1), detail: '1 RTT', tone: 'ok' },
            { label: 'Primer pixel', atFrame: s(5.3), detail: 'por fin', tone: 'ok' },
          ]}
        />
      </TransitionSeries.Sequence>

      {/* Al dato final: fundido. El remate quiere aterrizar, no irrumpir. */}
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: TRANSITION_FRAMES[2] })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[3]}>
        <Counter
          label="TLS 1.2 necesitaba dos vueltas. TLS 1.3 necesita"
          from={2}
          to={1}
          unit="RTT"
          decimals={0}
          thousandsSeparator=""
          durationInFrames={s(1.8)}
          footnote="RFC 8446, seccion 2: el handshake completo de TLS 1.3 se cierra en un unico round trip."
        />
        {/* Reacciona justo cuando el contador aterriza en 1. */}
        <OkiCorner expression="surprised" corner="bottom-left" startFrame={s(2.2)} seed={8} size={160} />
      </TransitionSeries.Sequence>
    </TransitionSeries>

    <FinalFade />
  </AbsoluteFill>
);
