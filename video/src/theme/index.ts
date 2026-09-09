/**
 * Identidad visual del canal. Un solo sitio.
 *
 * Que este centralizado no es orden por el orden: los 3 thumbnails y los
 * Shorts se generan como componentes de Remotion precisamente para que
 * hereden esto y todo el canal se vea como una sola cosa.
 */

export const theme = {
  color: {
    /** Fondo oscuro, no negro puro: el negro puro vibra en compresion de YouTube. */
    bg: '#0B0E14',
    bgElevated: '#141922',
    grid: '#1C2430',
    /** Enlaces y bordes de tarjeta. Mas claro que la rejilla: la rejilla es
     *  fondo y debe hundirse, un enlace es contenido y debe leerse. */
    line: '#33415A',

    text: '#E6EDF3',
    textMuted: '#8B98A9',

    /** Acento primario: el color del "esto es lo que importa". */
    accent: '#4DA3FF',
    /** Secundario, para el segundo actor de un diagrama. */
    accentAlt: '#A78BFA',
    /** Exito / confirmacion / paquete entregado. */
    ok: '#3FD68C',
    /** Error / paquete perdido / timeout. */
    danger: '#FF6B6B',
    warn: '#FFC857',
  },

  font: {
    /** Para narracion y titulos. */
    sans: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    /** Para codigo y valores tecnicos. */
    mono: '"JetBrains Mono", "Cascadia Code", "Consolas", monospace',
  },

  size: {
    title: 76,
    subtitle: 40,
    label: 26,
    caption: 20,
    code: 24,
  },

  /**
   * Ritmo de animacion en frames a 30fps. Tener esto nombrado evita que cada
   * escena invente su propia duracion y el video se sienta arritmico.
   */
  timing: {
    fps: 30,
    quick: 8,
    normal: 15,
    slow: 30,
  },

  radius: { sm: 6, md: 12, lg: 20 },
} as const;

export type Theme = typeof theme;
