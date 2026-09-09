#!/usr/bin/env node
/**
 * Prepara el proyecto para trabajar.
 *
 * Hace lo aburrido y comprueba lo que suele fallar, en vez de dejarlo escrito
 * en un README que nadie lee entero:
 *
 *   - crea el .env a partir del ejemplo, sin pisar el que ya tengas
 *   - genera el token del puente HTTP, que si no queda vacio y el servidor
 *     se niega a arrancar
 *   - crea las carpetas de datos
 *   - inicializa la base
 *   - comprueba las versiones de Node y pnpm
 *
 *   node tools/setup.mjs
 */

import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const ok = (text) => console.log(`  OK    ${text}`);
const info = (text) => console.log(`  ..    ${text}`);
const warn = (text) => console.log(`  AVISO ${text}`);

console.log('\nPreparando Osaki\n');

/* --- Node -------------------------------------------------------------- */

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`  ERROR Node ${process.versions.node} es demasiado antiguo. Hace falta 20 o superior.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

/* --- .env -------------------------------------------------------------- */

const envPath = join(root, '.env');
const examplePath = join(root, '.env.example');

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  ok('.env creado a partir de .env.example');
} else {
  info('.env ya existe, no se toca');
}

let env = readFileSync(envPath, 'utf8');

/**
 * Token del puente. Se genera solo porque, si queda vacio, el servidor se
 * niega a arrancar y el mensaje de error llega cuando ya estas intentando
 * usar n8n, que es el peor momento.
 */
if (/^N8N_WEBHOOK_TOKEN=\s*$/m.test(env)) {
  const token = randomBytes(24).toString('hex');
  env = env.replace(/^N8N_WEBHOOK_TOKEN=.*$/m, `N8N_WEBHOOK_TOKEN=${token}`);
  writeFileSync(envPath, env, 'utf8');
  ok('token del puente HTTP generado');
} else {
  info('el token del puente ya estaba puesto');
}

/* --- Carpetas ---------------------------------------------------------- */

for (const dir of ['data/videos', 'data/audio', 'data/renders', 'data/exchange', 'data/fixtures']) {
  mkdirSync(join(root, dir), { recursive: true });
}
ok('carpetas de datos creadas');

/* --- Base de datos ------------------------------------------------------ */

try {
  const { openDatabase } = await import('../packages/db/dist/index.js');
  openDatabase();
  ok('base de datos inicializada');
} catch {
  warn('la base no se pudo inicializar: ejecuta "pnpm build" primero y repite');
}

/* --- Que falta por rellenar --------------------------------------------- */

const pendientes = [];

if (/^ANTHROPIC_API_KEY=\s*$/m.test(env)) {
  pendientes.push([
    'ANTHROPIC_API_KEY',
    'Solo si quieres LLM_PROVIDER=api. Con "mock" o "manual" no hace falta.',
  ]);
}
if (/^YOUTUBE_CLIENT_ID=\s*$/m.test(env)) {
  pendientes.push(['YOUTUBE_CLIENT_*', 'Solo para publicar. Todo lo demas funciona sin esto.']);
}
if (/^PIPER_VOICE_MODEL=\s*$/m.test(env)) {
  pendientes.push(['PIPER_VOICE_MODEL', 'Solo si usas VOICE_PROVIDER=piper.']);
}

console.log('');

if (pendientes.length > 0) {
  console.log('  Sin rellenar (ninguno bloquea el arranque):\n');
  for (const [key, why] of pendientes) console.log(`    ${key.padEnd(20)} ${why}`);
  console.log('');
}

console.log('Listo. Empieza por aqui:\n');
console.log('  pnpm build            compila todo');
console.log('  pnpm test             comprueba que nada esta roto');
console.log('  pnpm render:demo      renderiza el video de prueba');
console.log('  pnpm osaki doctor     revisa la configuracion');
console.log('');
console.log('La guia paso a paso esta en EMPIEZA-AQUI.md\n');
