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

const log = createLogger('cli');

const HELP = `
osaki — pipeline de produccion de video

Uso:
  osaki status                      Estado de todos los videos
  osaki stages                      Lista las etapas y en que fase llegan
  osaki new "<titulo>"              Crea un video nuevo
  osaki run <etapa> --video <id>    Ejecuta una etapa aislada
  osaki approve <gate> --video <id> [--reject] [--notes "..."]
  osaki doctor                      Comprueba la configuracion

Gates de aprobacion humana: angles, render

Ejemplos (PowerShell):
  pnpm osaki new "Como WhatsApp garantiza que no se pierda un mensaje"
  pnpm osaki run research --video vid_20260909_a3f1c2
  pnpm osaki approve angles --video vid_20260909_a3f1c2 --notes "Me quedo con el 2"
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
      const videoId = requireVideoId(flags);
      const db = openDatabase();

      if (!new VideoRepository(db).find(videoId)) {
        throw new OsakiError(`No existe el video ${videoId}.`);
      }

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

      // Los gates humanos no se saltan por diseno: publish comprueba esto.
      if (stageName === 'publish' && !new ApprovalRepository(db).isApproved(videoId, 'render')) {
        throw new OsakiError(
          `No se puede publicar ${videoId}: falta la aprobacion humana del render.\n` +
            `  Revisa el video y luego:  pnpm osaki approve render --video ${videoId}`,
        );
      }

      if (!definition.implemented) {
        throw new OsakiError(
          `La etapa "${stageName}" llega en la fase ${definition.phase}.\n  ${definition.summary}`,
        );
      }

      log.info(`etapa ${stageName} para ${videoId}`);
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
