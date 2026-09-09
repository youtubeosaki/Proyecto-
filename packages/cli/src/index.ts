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
      console.log('\nConfiguracion:\n');
      console.log(`  proveedor LLM       ${config.LLM_PROVIDER}`);
      console.log(`  modelo principal    ${config.LLM_MODEL_PRIMARY}`);
      console.log(`  modelo utilitario   ${config.LLM_MODEL_UTILITY}`);
      console.log(`  clave de API        ${config.ANTHROPIC_API_KEY ? 'presente' : 'ausente'}`);
      console.log(`  proveedor de voz    ${config.VOICE_PROVIDER}`);
      console.log(`  claims sin fuente   ${config.UNVERIFIED_CLAIMS_POLICY}`);
      console.log(`  base de datos       ${config.paths.database}`);

      if (config.LLM_PROVIDER === 'api' && !config.ANTHROPIC_API_KEY) {
        console.log('\n  AVISO: LLM_PROVIDER=api pero ANTHROPIC_API_KEY esta vacia.');
        console.log('  Usa LLM_PROVIDER=manual para trabajar con tu suscripcion de claude.ai.');
      }

      openDatabase();
      console.log('\n  Base de datos abierta y migrada.\n');
      return;
    }

    case 'serve': {
      // El servidor recibe `runStage` inyectado: si lo importara el mismo,
      // server dependeria de cli y cli de server, y eso no compila.
      startOsakiServer({
        port: typeof flags.port === 'string' ? Number(flags.port) : undefined,
        runStage,
      });
      // Deliberadamente sin `return`: el proceso queda vivo escuchando.
      await new Promise(() => {});
      return;
    }

    case 'ideas': {
      const ideas = listTopIdeas(20);
      if (ideas.length === 0) {
        console.log('\n  El banco esta vacio. Llenalo con:  pnpm osaki run ideas\n');
        return;
      }
      console.log('\n  SCORE  TITULO');
      for (const idea of ideas) {
        console.log(`  ${(idea.compositeScore ?? 0).toFixed(2).padStart(5)}  ${idea.title}`);
      }
      console.log('');
      return;
    }

    case 'choose': {
      const angleId = positional[0];
      if (!angleId) throw new OsakiError('Uso: osaki choose <a1|a2|a3> --video <id>');

      const videoId = requireVideoId(flags);
      const notes = typeof flags.notes === 'string' ? flags.notes : undefined;

      const updated = chooseAngle(videoId, angleId, notes);
      const chosen = updated.angles.find((angle) => angle.id === angleId)!;

      // La eleccion ES la aprobacion del gate #1: queda registrada con las
      // alternativas que habia sobre la mesa.
      new ApprovalRepository(openDatabase()).record({
        videoId,
        gate: 'angles',
        decision: 'approved',
        notes,
        edited: { chosenAngleId: angleId, alternatives: updated.angles.map((angle) => angle.id) },
      });

      console.log(`\n  Angulo elegido: ${chosen.title}`);
      if (notes) console.log(`  Tus notas: ${notes}`);
      console.log(`\n  Siguiente:  pnpm osaki run script --video ${videoId}\n`);
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
