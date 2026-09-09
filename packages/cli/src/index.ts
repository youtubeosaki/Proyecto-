#!/usr/bin/env node
import {
  HumanInputRequiredError,
  OsakiError,
  createLogger,
  isHumanGate,
  loadConfig,
  type Stage,
} from '@osaki/core';
import { ApprovalRepository, StageRunRepository, VideoRepository, openDatabase } from '@osaki/db';
import { STAGES, STAGE_LIST } from './stages.js';
import { assertRenderApproved, runStage } from './runners.js';
import { startOsakiServer } from '@osaki/server';
import { chooseAngle, readAngles } from '@osaki/script';
import { listTopIdeas } from '@osaki/ingest';

const log = createLogger('cli');

const HELP = `
osaki — pipeline de produccion de video

Uso:
  osaki status                      Estado de todos los videos
  osaki stages                      Lista las etapas y en que fase llegan
  osaki new "<titulo>"              Crea un video nuevo
  osaki run <etapa> --video <id>    Ejecuta una etapa aislada
  osaki choose <a1|a2|a3> --video <id> [--notes "..."]
  osaki approve <gate> --video <id> [--reject] [--notes "..."]
  osaki ideas                       Mejores ideas guardadas
  osaki serve [--port 4599]         Puente HTTP para n8n
  osaki doctor                      Comprueba la configuracion

Gates de aprobacion humana: angles, render

Ejemplos (PowerShell):
  pnpm osaki new "Como WhatsApp garantiza que no se pierda un mensaje"
  pnpm osaki run research --video vid_20260909_a3f1c2
  pnpm osaki choose a2 --video vid_20260909_a3f1c2 --notes "Mas concreto"
`.trim();

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      i++;
    } else {
      flags[name] = true;
    }
  }

  return { command, positional, flags };
}

function requireVideoId(flags: ParsedArgs['flags']): string {
  const id = flags.video;
  if (typeof id !== 'string') {
    throw new OsakiError('Falta --video <id>. Usa `osaki status` para ver los ids.');
  }
  return id;
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  if (command === 'help' || flags.help) {
    console.log(HELP);
    return;
  }

  const config = loadConfig();

  switch (command) {
    case 'stages': {
      console.log('\nEtapas del pipeline:\n');
      for (const def of STAGE_LIST) {
        const gate = def.humanGate ? '  [APROBACION HUMANA]' : '';
        const state = def.implemented ? 'listo' : `fase ${def.phase}`;
        console.log(`  ${def.stage.padEnd(12)} ${state.padEnd(9)} ${def.summary}${gate}`);
      }
      console.log('');
      return;
    }

    case 'doctor': {
      /**
       * Diagnostico en lenguaje llano.
       *
       * Un `doctor` que vuelca variables de entorno solo sirve a quien ya
       * sabe que significan. Este dice, para cada cosa, si funciona y que
       * hacer si no. Es la primera parada cuando algo falla.
       */
      const linea = (estado: 'ok' | 'aviso' | 'falta', texto: string, nota?: string) => {
        const marca = estado === 'ok' ? '  OK   ' : estado === 'aviso' ? '  ..   ' : '  FALTA';
        console.log(`${marca} ${texto}`);
        if (nota) console.log(`         ${nota}`);
      };

      console.log('\nRevisando la configuracion\n');

      // --- Guiones
      if (config.LLM_PROVIDER === 'mock') {
        linea('ok', 'Guiones: modo prueba (mock)', 'Lee respuestas de ejemplo. No gasta nada.');
      } else if (config.LLM_PROVIDER === 'manual') {
        linea('ok', 'Guiones: modo manual', 'Copias y pegas en claude.ai. No gasta creditos de API.');
      } else if (config.ANTHROPIC_API_KEY) {
        linea('ok', `Guiones: API de Anthropic (${config.LLM_MODEL_PRIMARY})`);
      } else {
        linea('falta', 'Guiones: pusiste LLM_PROVIDER=api pero no hay clave', 'Rellena ANTHROPIC_API_KEY en .env, o pon LLM_PROVIDER=manual.');
      }

      // --- Voz
      if (config.VOICE_PROVIDER === 'file') {
        linea('ok', 'Voz: tu grabacion', 'Deja los WAV en data/audio/<id>/. La etapa te dice cuales faltan.');
      } else if (config.VOICE_PROVIDER === 'piper') {
        if (config.PIPER_VOICE_MODEL) linea('ok', 'Voz: Piper (local, gratis)');
        else linea('falta', 'Voz: Piper sin modelo', 'Rellena PIPER_VOICE_MODEL con la ruta al archivo .onnx.');
      } else {
        linea('aviso', 'Voz: ElevenLabs', 'Todavia no esta implementado. Usa "file" o "piper".');
      }

      // --- Verificacion de fuentes
      linea(
        'ok',
        `Fuentes: las no verificadas se ${config.UNVERIFIED_CLAIMS_POLICY === 'exclude' ? 'DESCARTAN' : 'marcan'}`,
        `Minimo para dejar avanzar un tema: ${config.MIN_VERIFIED_CLAIMS} afirmaciones verificadas.`,
      );

      // --- Publicacion
      if (config.YOUTUBE_REFRESH_TOKEN) {
        linea('ok', `YouTube: configurado, sube como ${config.YOUTUBE_DEFAULT_PRIVACY.toUpperCase()}`);
      } else {
        linea('aviso', 'YouTube: sin configurar', 'Todo funciona menos la etapa de publicar.');
      }

      // --- Puente para n8n
      if (config.N8N_WEBHOOK_TOKEN) linea('ok', 'Puente para n8n: token puesto');
      else linea('falta', 'Puente para n8n: sin token', 'Ejecuta "pnpm setup" y se genera solo.');

      // --- Base de datos
      try {
        const db = openDatabase();
        const total = (db.prepare('SELECT COUNT(*) AS n FROM videos').get() as { n: number }).n;
        const ideas = (db.prepare('SELECT COUNT(*) AS n FROM ideas').get() as { n: number }).n;
        linea('ok', `Base de datos: ${total} video(s), ${ideas} idea(s)`, config.paths.database);
      } catch (error) {
        linea('falta', 'Base de datos: no se pudo abrir', error instanceof Error ? error.message : '');
      }

      console.log('\nSiguiente paso:  pnpm osaki new "<el tema de tu video>"\n');
      return;
    }

    case 'new': {
      const title = positional[0];
      if (!title) throw new OsakiError('Uso: osaki new "<titulo>"');

      const video = new VideoRepository(openDatabase()).create({ title });
      console.log(`\n  Creado ${video.id}`);
      console.log(`  Slug   ${video.slug}`);
      console.log(`\n  Siguiente:  pnpm osaki run research --video ${video.id}\n`);
      return;
    }

    case 'status': {
      const videos = new VideoRepository(openDatabase()).list();
      if (videos.length === 0) {
        console.log('\n  No hay videos todavia. Empieza con:  pnpm osaki new "<titulo>"\n');
        return;
      }

      console.log('\n  ID                      ETAPA        ESTADO       TITULO');
      for (const video of videos) {
        console.log(
          `  ${video.id.padEnd(22)}  ${video.stage.padEnd(11)}  ${video.status.padEnd(11)}  ${video.title}`,
        );
      }
      console.log('');
      return;
    }

    case 'approve': {
      const gate = positional[0];
      if (gate !== 'angles' && gate !== 'render') {
        throw new OsakiError('El gate debe ser "angles" o "render".');
      }

      const videoId = requireVideoId(flags);
      const db = openDatabase();

      if (!new VideoRepository(db).find(videoId)) {
        throw new OsakiError(`No existe el video ${videoId}.`);
      }

      const decision = flags.reject ? 'rejected' : 'approved';
      new ApprovalRepository(db).record({
        videoId,
        gate,
        decision,
        notes: typeof flags.notes === 'string' ? flags.notes : undefined,
      });

      console.log(`\n  Gate "${gate}" de ${videoId}: ${decision}\n`);
      return;
    }

    case 'run': {
      const stageName = positional[0] as Stage | undefined;
      if (!stageName || !(stageName in STAGES)) {
        throw new OsakiError(
          `Etapa desconocida "${stageName ?? ''}". Usa \`osaki stages\` para ver la lista.`,
        );
      }

      const definition = STAGES[stageName];

      // La ingesta alimenta el banco de ideas: no pertenece a ningun video.
      if (stageName === 'ideas') {
        const outcome = await runStage('ideas', null);
        console.log('\n' + outcome.summary.join('\n') + '\n');
        return;
      }

      const videoId = requireVideoId(flags);
      const db = openDatabase();

      if (!new VideoRepository(db).find(videoId)) {
        throw new OsakiError(`No existe el video ${videoId}.`);
      }

      /**
       * El gate humano se comprueba ANTES que las dependencias de etapa.
       *
       * Al reves, alguien sin aprobacion recibe "ejecuta packaging primero",
       * arregla eso, y solo entonces descubre el bloqueo real. El mensaje
       * tiene que nombrar el motivo de verdad a la primera.
       */
      if (stageName === 'publish' || stageName === 'shorts') assertRenderApproved(videoId);

      // Una etapa no arranca si la anterior no dejo su artefacto. Es lo que
      // hace que reejecutar la 6 sea seguro: comprueba la 5 y sigue.
      if (definition.requires) {
        const previous = new StageRunRepository(db).lastSuccessful(videoId, definition.requires);
        if (!previous) {
          throw new OsakiError(
            `La etapa "${stageName}" necesita el resultado de "${definition.requires}", que aun no se ha ejecutado con exito.\n` +
              `  Ejecuta primero:  pnpm osaki run ${definition.requires} --video ${videoId}`,
          );
        }
      }

      if (!definition.implemented) {
        throw new OsakiError(
          `La etapa "${stageName}" llega en la fase ${definition.phase}.\n  ${definition.summary}`,
        );
      }

      log.info(`etapa ${stageName} para ${videoId}`);
      const outcome = await runStage(stageName, videoId);
      console.log('\n' + outcome.summary.join('\n') + '\n');
      return;
    }

    default:
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (error instanceof HumanInputRequiredError) {
    // No es un fallo: el pipeline espera a un humano a proposito.
    console.error(`\n  ${error.message}\n`);
    console.error(error.instructions.replace(/^/gm, '  '));
    console.error('');
    process.exitCode = 2;
    return;
  }

  if (error instanceof OsakiError) {
    console.error(`\n  ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
