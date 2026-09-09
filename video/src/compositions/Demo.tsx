import type React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TitleCard } from '../components/TitleCard';
import { NetworkDiagram } from '../components/NetworkDiagram';
import { Timeline } from '../components/Timeline';
import { Counter } from '../components/Counter';
import { theme } from '../theme/index';

/**
 * Composicion de prueba de la Fase 1.
 *
 * Contenido: que pasa cuando escribes una URL, resumido a 30 segundos.
 * No es un video del canal: es la prueba de que el motor renderiza, de que
 * los componentes comparten identidad visual y de que el timing por escena
 * funciona. En la Fase 3 este ensamblado lo genera el storyboard a partir
 * del guion, no una mano escribiendo <Sequence> a mano.
 *
 * Los datos son reales y verificables (RFC 8446 para el 1-RTT de TLS 1.3),
 * porque hasta el video de prueba debe cumplir la regla de la fuente.
 */

const SECONDS = 30;

export const DEMO_DURATION_IN_FRAMES = SECONDS * theme.timing.fps;

export const Demo: React.FC = () => {
  const { fps } = useVideoConfig();
  const s = (seconds: number): number => Math.round(seconds * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
      <Sequence durationInFrames={s(5)}>
        <TitleCard
          eyebrow="Prueba de motor"
          title="Que pasa cuando escribes una URL"
          subtitle="Cuatro viajes de ida y vuelta antes de que veas un solo pixel."
        />
      </Sequence>

      <Sequence from={s(5)} durationInFrames={s(10)}>
        <NetworkDiagram
          caption="El navegador no sabe donde esta el servidor. Primero pregunta."
          nodes={[
            { id: 'browser', label: 'Navegador', sublabel: 'tu maquina', x: 12, y: 50, variant: 'accent' },
            { id: 'resolver', label: 'Resolver DNS', sublabel: '1.1.1.1', x: 50, y: 20, variant: 'default' },
            { id: 'server', label: 'Servidor', sublabel: '104.16.x.x', x: 88, y: 50, variant: 'default' },
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
      </Sequence>

      <Sequence from={s(15)} durationInFrames={s(8)}>
        <Timeline
          title="Los viajes que nadie ve"
          events={[
            { label: 'DNS', atFrame: s(0.3), detail: '~20 ms', tone: 'accent' },
            { label: 'TCP', atFrame: s(1.6), detail: '1 RTT', tone: 'accent' },
            { label: 'TLS 1.3', atFrame: s(2.9), detail: '1 RTT', tone: 'warn' },
            { label: 'HTTP GET', atFrame: s(4.2), detail: '1 RTT', tone: 'ok' },
            { label: 'Primer pixel', atFrame: s(5.5), detail: 'por fin', tone: 'ok' },
          ]}
        />
      </Sequence>

      <Sequence from={s(23)} durationInFrames={s(7)}>
        <Counter
          label="TLS 1.2 necesitaba dos vueltas. TLS 1.3 necesita"
          from={2}
          to={1}
          unit="RTT"
          decimals={0}
          thousandsSeparator=""
          durationInFrames={s(2)}
          footnote="RFC 8446, seccion 2: el handshake completo de TLS 1.3 se cierra en un unico round trip."
        />
      </Sequence>
    </AbsoluteFill>
  );
};
