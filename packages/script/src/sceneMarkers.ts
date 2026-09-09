import { isKnownSceneKind, type SceneMarker } from '@osaki/core';

/**
 * PARSER DE MARCAS DE ESCENA
 *
 * El guion lleva marcas como:
 *
 *   [ESCENA: networkDiagram | El navegador pregunta al resolver]
 *   [ESCENA: counter]
 *
 * Formato: el tipo de escena, y opcionalmente una nota tras una barra que
 * describe que debe mostrar. La nota es para el storyboard, no para el video.
 *
 * El parser NO inventa: si el tipo no esta en el catalogo, lo devuelve tal
 * cual y marcado como desconocido. Mapear al componente mas parecido aqui
 * seria el fallo silencioso que todo este diseño evita, porque produciria un
 * video que se renderiza bien y explica mal.
 */

const MARKER = /\[ESCENA:\s*([^\]]+)\]/gi;

export interface ParsedMarker extends SceneMarker {
  known: boolean;
  note?: string;
}

export function parseSceneMarkers(text: string): ParsedMarker[] {
  const markers: ParsedMarker[] = [];

  for (const match of text.matchAll(MARKER)) {
    const body = (match[1] ?? '').trim();
    const [kindPart, ...noteParts] = body.split('|');
    const kind = (kindPart ?? '').trim();
    const note = noteParts.join('|').trim();

    markers.push({
      kind,
      raw: match[0],
      props: {},
      known: isKnownSceneKind(kind),
      note: note || undefined,
    });
  }

  return markers;
}

/** Quita las marcas para dejar solo lo que se narra. Es lo que va al TTS. */
export function stripSceneMarkers(text: string): string {
  return text.replace(MARKER, '').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Tipos de escena pedidos por el guion que no existen en el catalogo. */
export function unknownSceneKinds(markers: readonly ParsedMarker[]): string[] {
  return [...new Set(markers.filter((marker) => !marker.known).map((marker) => marker.kind))];
}
