import test from 'node:test';
import assert from 'node:assert/strict';
import { withTempData, freshConfig } from './helpers.mjs';

/**
 * LA VERIFICACION DE FUENTES
 *
 * Una afirmacion sin fuente primaria recuperable no llega al guion.
 *
 * Estas pruebas cubren el filtro MECANICO, que corre antes de gastar tokens
 * y no se deja convencer por una cita bien escrita. El revisor que viene
 * despues es un modelo y no se puede probar de forma determinista; este
 * filtro si, y es el que atrapa los casos groseros.
 */

const temp = withTempData();
test.after(() => temp.cleanup());

const base = {
  id: 'c1',
  statement: 'Afirmacion tecnica cualquiera.',
  supportingQuote: 'Una cita literal lo bastante larga como para ser real.',
  verified: false,
};

const goodSource = {
  url: 'https://www.rfc-editor.org/rfc/rfc9293',
  title: 'RFC 9293',
  tier: 'primary',
  retrievedAt: new Date().toISOString(),
};

async function rules(claims) {
  await freshConfig();
  const { applyMechanicalRules } = await import('../packages/research/dist/index.js');
  return applyMechanicalRules(claims);
}

test('rechaza una afirmacion sin fuente', async () => {
  const [claim] = await rules([{ ...base }]);
  assert.equal(claim.verified, false);
  assert.match(claim.verificationNote, /sin fuente/i);
});

test('rechaza una fuente de nivel debil', async () => {
  const [claim] = await rules([{ ...base, source: { ...goodSource, tier: 'weak' } }]);
  assert.match(claim.verificationNote, /debil/i);
});

test('rechaza una afirmacion sin cita literal', async () => {
  const [claim] = await rules([{ ...base, supportingQuote: '', source: goodSource }]);
  assert.match(claim.verificationNote, /cita literal/i);
});

test('rechaza URLs con forma de inventada', async () => {
  const casos = [
    ['https://example.com/algo', /dominio de ejemplo/i],
    ['https://blog.example.org/a3f9c2b1d4e5f6a7b8c9d0e1f2a3', /dominio de ejemplo/i],
    ['https://real.dev/posts/a3f9c2b1d4e5f6a7b8c9d0e1f2a3b4c5', /identificador que parece generado/i],
    ['no-es-una-url', /no es una URL valida/i],
  ];

  for (const [url, esperado] of casos) {
    const [claim] = await rules([{ ...base, source: { ...goodSource, url } }]);
    assert.match(claim.verificationNote ?? '', esperado, `deberia rechazar ${url}`);
  }
});

test('una afirmacion solida sobrevive al filtro mecanico sin quedar aprobada', async () => {
  const [claim] = await rules([{ ...base, source: goodSource }]);

  // Pasa el filtro, pero NO queda verificada: eso lo decide el revisor.
  // Que el filtro mecanico pudiera aprobar seria un agujero: bastaria una
  // URL con buena pinta para colar cualquier afirmacion.
  assert.equal(claim.verified, false, 'el filtro mecanico no debe aprobar por su cuenta');
  assert.equal(claim.verificationNote, undefined, 'deberia pasar sin nota de rechazo');
});

test('las afirmaciones no verificadas no llegan al guion', async () => {
  process.env.UNVERIFIED_CLAIMS_POLICY = 'exclude';
  await freshConfig();
  const { claimsForScript } = await import('../packages/research/dist/index.js');

  const sheet = {
    videoId: 'v1',
    topic: 't',
    generatedAt: new Date().toISOString(),
    openQuestions: [],
    claims: [
      { ...base, id: 'ok', verified: true, source: goodSource },
      { ...base, id: 'malo', verified: false, verificationNote: 'sin fuente' },
    ],
  };

  const visible = claimsForScript(sheet);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'ok', 'una afirmacion sin verificar llego al guion');
});
