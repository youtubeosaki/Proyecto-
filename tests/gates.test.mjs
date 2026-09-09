import test from 'node:test';
import assert from 'node:assert/strict';
import { withTempData, freshConfig } from './helpers.mjs';

/**
 * LA GARANTIA QUE SOSTIENE TODO EL PROYECTO
 *
 * Ningun video puede publicarse sin aprobacion humana del render.
 *
 * Si alguna vez estas pruebas fallan, no se arreglan relajandolas: es que
 * alguien abrio un camino hacia la publicacion que se salta al humano, y eso
 * es exactamente lo que YouTube penaliza como contenido inautentico.
 */

const temp = withTempData();
test.after(() => temp.cleanup());

test('publish se niega sin aprobacion del render', async () => {
  await freshConfig();
  const { openDatabase, VideoRepository } = await import('../packages/db/dist/index.js');
  const { runPublishStage } = await import('../packages/publish/dist/index.js');

  const video = new VideoRepository(openDatabase()).create({ title: 'Prueba' });

  await assert.rejects(
    () => runPublishStage(video.id, { titles: [{ text: 't' }], description: 'd', tags: ['x'] }),
    /falta la aprobacion humana del render/i,
    'publico un video sin aprobacion',
  );
});

test('una aprobacion revocada vuelve a bloquear', async () => {
  await freshConfig();
  const { openDatabase, VideoRepository, ApprovalRepository } = await import(
    '../packages/db/dist/index.js'
  );

  const db = openDatabase();
  const video = new VideoRepository(db).create({ title: 'Revocable' });
  const approvals = new ApprovalRepository(db);

  approvals.record({ videoId: video.id, gate: 'render', decision: 'approved' });
  assert.equal(approvals.isApproved(video.id, 'render'), true);

  // Cambiar de opinion tiene que contar: gana la ultima decision, no la
  // primera aprobacion que aparezca en la tabla.
  approvals.record({ videoId: video.id, gate: 'render', decision: 'rejected' });
  assert.equal(approvals.isApproved(video.id, 'render'), false, 'la revocacion no surtio efecto');
});

test('aprobar un gate no aprueba el otro', async () => {
  await freshConfig();
  const { openDatabase, VideoRepository, ApprovalRepository } = await import(
    '../packages/db/dist/index.js'
  );

  const db = openDatabase();
  const video = new VideoRepository(db).create({ title: 'Independientes' });
  const approvals = new ApprovalRepository(db);

  approvals.record({ videoId: video.id, gate: 'angles', decision: 'approved' });

  assert.equal(approvals.isApproved(video.id, 'angles'), true);
  assert.equal(
    approvals.isApproved(video.id, 'render'),
    false,
    'aprobar el angulo aprobo tambien el render',
  );
});

test('el tipo de privacidad no admite "public"', async () => {
  // No se puede comprobar en tiempo de ejecucion porque es un tipo, asi que
  // se comprueba sobre el fuente: si alguien añade 'public' al tipo, esto
  // falla y obliga a justificarlo.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('packages/publish/src/youtube.ts', 'utf8');

  const match = source.match(/export type Privacy = ([^;]+);/);
  assert.ok(match, 'no se encontro el tipo Privacy');
  assert.ok(
    !match[1].includes("'public'"),
    'el tipo Privacy admite "public": el pipeline no debe poder publicar en abierto',
  );
});
