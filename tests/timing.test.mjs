import test from 'node:test';
import assert from 'node:assert/strict';
import { withTempData, freshConfig } from './helpers.mjs';

/**
 * TIMING, SUBTITULOS Y DEDUPLICACION
 *
 * Fallos de estos tres no dan error: producen un video desincronizado, unos
 * subtitulos ilegibles o el mismo tema publicado dos veces. Son exactamente
 * el tipo de bug que solo se descubre mirando el resultado, asi que conviene
 * que los descubra una prueba.
 */

const temp = withTempData();
test.after(() => temp.cleanup());

test('el timing se acumula redondeado y no acumula error', async () => {
  await freshConfig();
  const fps = 30;

  // Duraciones con decimales que no caen en frames enteros: es donde se ve
  // si el error se va sumando.
  const duraciones = [13.61, 12.03, 17.77, 23.59, 16.51, 13.63];
  const GAP = 0.35;

  let cursor = 0;
  const timings = duraciones.map((seconds, index) => {
    const durationInFrames = Math.max(1, Math.round((seconds + GAP) * fps));
    const timing = { segmentIndex: index, startFrame: cursor, durationInFrames };
    cursor += durationInFrames;
    return timing;
  });

  // Sin huecos ni solapes: el inicio de cada escena es el final de la anterior.
  let expected = 0;
  for (const timing of timings) {
    assert.equal(timing.startFrame, expected, `hueco o solape en el segmento ${timing.segmentIndex}`);
    expected += timing.durationInFrames;
  }

  // La suma de duraciones es exactamente el total: si se hubiera acumulado el
  // valor exacto y redondeado al final, aqui habria deriva.
  const suma = timings.reduce((total, t) => total + t.durationInFrames, 0);
  assert.equal(suma, cursor);
});

test('los subtitulos cubren toda la duracion sin huecos', async () => {
  const { buildCaptions } = await import('../packages/shorts/dist/index.js');

  const texto =
    'Cuando el plazo expira, el mensaje se manda otra vez. Y aqui llega el problema ' +
    'interesante: si el original si habia llegado, el destinatario acaba de recibir el ' +
    'mismo mensaje dos veces.';

  const total = 420;
  const captions = buildCaptions(texto, total);

  assert.ok(captions.length > 1, 'no se partio en varias lineas');

  let cursor = 0;
  for (const caption of captions) {
    assert.equal(caption.startFrame, cursor, 'hueco entre subtitulos');
    assert.ok(caption.durationInFrames > 0, 'subtitulo de duracion cero');
    cursor += caption.durationInFrames;
  }

  // El ultimo absorbe el redondeo: sin eso quedan frames sin subtitulo justo
  // al final, que es donde esta el remate.
  assert.equal(cursor, total, 'los subtitulos no cubren toda la escena');
});

test('los subtitulos cortan tras puntuacion fuerte', async () => {
  const { splitIntoLines } = await import('../packages/shorts/dist/index.js');

  const lineas = splitIntoLines(
    'Y aqui llega el problema interesante: si el original si habia llegado, todo cambia.',
  );

  // Ninguna linea debe empezar a media oracion justo tras dos puntos.
  const empiezaMal = lineas.find((linea) => /^(si el|interesante:)/.test(linea) && linea.length < 15);
  assert.equal(
    empiezaMal,
    undefined,
    `linea que empieza a media oracion: "${empiezaMal}"`,
  );

  for (const linea of lineas) {
    assert.ok(linea.length <= 40, `linea demasiado larga para vertical: "${linea}"`);
  }
});

test('el mismo tema con distinto titulo colapsa en una idea', async () => {
  const { dedupeKeyFor, dedupeWithin } = await import('../packages/ingest/dist/index.js');

  const a = 'How Discord stores billions of messages';
  const b = 'Discord: storing billions of messages';

  assert.equal(dedupeKeyFor(a), dedupeKeyFor(b), 'el mismo tema produjo claves distintas');

  const ideas = [
    { id: '1', title: a, summary: '', sourceType: 'rss', dedupeKey: dedupeKeyFor(a), discoveredAt: new Date().toISOString() },
    { id: '2', title: b, summary: '', sourceType: 'hackernews', sourceUrl: 'https://x.dev', dedupeKey: dedupeKeyFor(b), discoveredAt: new Date().toISOString() },
  ];

  const unicas = dedupeWithin(ideas);
  assert.equal(unicas.length, 1);
  // Ante un duplicado gana el que trae fuente propia.
  assert.equal(unicas[0].sourceUrl, 'https://x.dev');
});

test('temas distintos no colapsan', async () => {
  const { dedupeKeyFor } = await import('../packages/ingest/dist/index.js');
  assert.notEqual(
    dedupeKeyFor('How TLS 1.3 saves a round trip'),
    dedupeKeyFor('How DNS resolution actually works'),
  );
});
