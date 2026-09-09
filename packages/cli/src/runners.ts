import {
  OsakiError,
  createLogger,
  isHumanGate,
  type Stage,
} from '@osaki/core';
import { ApprovalRepository, StageRunRepository, VideoRepository, openDatabase } from '@osaki/db';
import { listTopIdeas, runIdeasStage } from '@osaki/ingest';
import { readFactSheet, runResearchStage } from '@osaki/research';
import { chosenAngle, readAngles, readScript, runAnglesStage, runScriptStage } from '@osaki/script';
import {
  readAudio,
  readStoryboard,
  runAudioStage,
  runPackagingStage,
  runRenderStage,
  runStoryboardStage,
} from '@osaki/compose';

const log = createLogger('run');

export interface RunOutcome {
  /** Lineas que la CLI imprime al terminar. */
  summary: string[];
  /** Ruta del artefacto producido, si lo hubo. */
  artifactPath?: string;
  /** Si el pipeline queda esperando una decision tuya. */
  awaitingHuman?: boolean;
}

/**
 * Ejecuta una etapa aislada.
 *
 * Toda la orquestacion vive aqui y no dentro de los paquetes: los paquetes
 * saben hacer su trabajo, esta funcion sabe en que orden y con que estado. Es
 * lo que permite que n8n (fase 4) llame exactamente a lo mismo que llamas tu
 * desde PowerShell, sin duplicar logica.
 */
export async function runStage(stage: Stage, videoId: string | null): Promise<RunOutcome> {
  const db = openDatabase();
  const videos = new VideoRepository(db);
  const runs = new StageRunRepository(db);

  // La ingesta de ideas no pertenece a ningun video: alimenta el banco.
  if (stage === 'ideas') {
    const result = await runIdeasStage();
    return {
      summary: [
        `Recogidas ${result.fetched}, unicas ${result.afterDedupe}, nuevas guardadas ${result.inserted}.`,
        '',
        'Mejores ideas ahora mismo:',
        ...listTopIdeas(10).map(
          (idea, index) =>
            `  ${String(index + 1).padStart(2)}. [${(idea.compositeScore ?? 0).toFixed(2)}] ${idea.title}`,
        ),
        '',
        'Crea un video con:  pnpm osaki new "<titulo>"',
      ],
    };
  }

  if (!videoId) {
    throw new OsakiError(`La etapa "${stage}" necesita --video <id>.`);
  }

  const video = videos.find(videoId);
  if (!video) throw new OsakiError(`No existe el video ${videoId}.`);

  const runId = runs.start(videoId, stage);

  try {
    const outcome = await execute(stage, videoId, video.title);

    runs.finish(runId, outcome.artifactPath);
    videos.advance(
      videoId,
      stage,
      // Un gate humano no queda "done": queda esperando tu decision. Esa
      // distincion es la que impide que el pipeline siga solo.
      isHumanGate(stage) ? 'awaiting_approval' : 'done',
    );

    return outcome;
  } catch (error) {
    runs.fail(runId, error instanceof Error ? error.message : String(error));
    videos.advance(videoId, stage, 'failed');
    throw error;
  }
}

async function execute(stage: Stage, videoId: string, title: string): Promise<RunOutcome> {
  switch (stage) {
    case 'research': {
      const result = await runResearchStage(videoId, title);
      return {
        artifactPath: result.artifactPath,
        summary: [
          `Documento de hechos: ${result.verified} afirmaciones verificadas, ${result.rejected} descartadas.`,
          `  ${result.artifactPath}`,
          '',
          ...(result.rejected > 0
            ? [
                'Descartadas (no llegaran al guion):',
                ...result.sheet.claims
                  .filter((claim) => !claim.verified)
                  .slice(0, 8)
                  .map((claim) => `  - ${claim.statement.slice(0, 90)}\n      ${claim.verificationNote ?? ''}`),
                '',
              ]
            : []),
          `Siguiente:  pnpm osaki run angles --video ${videoId}`,
        ],
      };
    }

    case 'angles': {
      const sheet = readFactSheet(videoId);
      const artifact = await runAnglesStage(videoId, sheet);

      return {
        awaitingHuman: true,
        summary: [
          'APROBACION HUMANA #1 — elige un angulo:',
          '',
          ...artifact.angles.flatMap((angle) => [
            `  [${angle.id}] ${angle.title}`,
            `       gancho: ${angle.hook}`,
            `       tesis:  ${angle.thesis}`,
            `       por que funciona: ${angle.whyThisWorks}`,
            '',
          ]),
          `Elige con:  pnpm osaki choose <a1|a2|a3> --video ${videoId} --notes "..."`,
        ],
      };
    }

    case 'script': {
      const angles = readAngles(videoId);
      const angle = chosenAngle(angles);

      // El guion no se escribe sin tu eleccion. No hay valor por defecto a
      // proposito: elegir por ti seria saltarse el gate.
      if (!angle) {
        throw new OsakiError(
          `El video ${videoId} no tiene angulo elegido todavia.\n` +
            `  Elige uno:  pnpm osaki choose <a1|a2|a3> --video ${videoId}`,
          { stage: 'script' },
        );
      }

      const sheet = readFactSheet(videoId);
      const script = await runScriptStage(videoId, sheet, angle);

      const withScene = script.segments.filter((segment) => segment.scene).length;

      return {
        summary: [
          `Guion escrito: ${script.segments.length} segmentos, ${script.estimatedWords} palabras.`,
          `  ${withScene} segmentos con escena asignada.`,
          '',
          `Titulo: ${script.title}`,
          '',
          'La fase 3 (storyboard, audio y render) llega despues.',
        ],
      };
    }

    case 'storyboard': {
      const script = readScript(videoId);
      const storyboard = await runStoryboardStage(videoId, script);

      return {
        summary: [
          `Storyboard con ${storyboard.scenes.length} escenas.`,
          '',
          ...storyboard.scenes.map(
            (scene) => `  ${String(scene.segmentIndex).padStart(2)}. ${scene.kind}`,
          ),
          '',
          `Siguiente:  pnpm osaki run audio --video ${videoId}`,
        ],
      };
    }

    case 'audio': {
      const script = readScript(videoId);
      const storyboard = readStoryboard(videoId);
      const audio = await runAudioStage(videoId, script, storyboard);

      const minutes = Math.floor(audio.totalSeconds / 60);
      const seconds = Math.round(audio.totalSeconds % 60);

      return {
        summary: [
          `Audio de ${audio.segments.length} segmentos con el proveedor "${audio.provider}".`,
          `Duracion total: ${minutes}m ${String(seconds).padStart(2, '0')}s.`,
          '',
          'El storyboard se reescribio con el timing real de la narracion.',
          '',
          `Siguiente:  pnpm osaki run render --video ${videoId}`,
        ],
      };
    }

    case 'render': {
      const storyboard = readStoryboard(videoId);
      const audio = readAudio(videoId);
      const result = await runRenderStage(videoId, storyboard, audio);

      return {
        awaitingHuman: true,
        artifactPath: result.videoPath,
        summary: [
          'APROBACION HUMANA #2 — revisa el video antes de que exista ninguna subida:',
          '',
          `  ${result.videoPath}`,
          `  ${result.durationSeconds.toFixed(1)} segundos`,
          '',
          `Si te convence:  pnpm osaki approve render --video ${videoId}`,
          `Si no:           pnpm osaki approve render --video ${videoId} --reject --notes "..."`,
        ],
      };
    }

    case 'packaging': {
      const script = readScript(videoId);
      const sheet = readFactSheet(videoId);
      const audio = readAudio(videoId);
      const angle = chosenAngle(readAngles(videoId));

      if (!angle) {
        throw new OsakiError(`El video ${videoId} no tiene angulo elegido.`, { stage: 'packaging' });
      }

      const packaging = await runPackagingStage(videoId, script, sheet, audio, angle);

      return {
        summary: [
          'Titulos propuestos:',
          ...packaging.titles.map((title) => `  [${title.strategy}] ${title.text}`),
          '',
          `Capitulos: ${packaging.chapters.length}   Tags: ${packaging.tags.length}`,
          `Miniaturas por renderizar: ${packaging.thumbnails.length}`,
          '',
          'Renderiza las miniaturas con:',
          ...packaging.thumbnails.map(
            (thumb, index) =>
              `  pnpm --filter @osaki/video exec remotion still src/index.ts Thumbnail ` +
              `../data/renders/${videoId}/thumb-${index + 1}.png --props='${JSON.stringify(thumb)}'`,
          ),
        ],
      };
    }

    default:
      throw new OsakiError(`La etapa "${stage}" todavia no esta implementada.`, { stage });
  }
}

/** Comprueba el gate humano del render antes de dejar publicar. */
export function assertRenderApproved(videoId: string): void {
  if (!new ApprovalRepository(openDatabase()).isApproved(videoId, 'render')) {
    throw new OsakiError(
      `No se puede publicar ${videoId}: falta la aprobacion humana del render.\n` +
        `  Revisa el video y luego:  pnpm osaki approve render --video ${videoId}`,
    );
  }
  log.debug(`render aprobado para ${videoId}`);
}
