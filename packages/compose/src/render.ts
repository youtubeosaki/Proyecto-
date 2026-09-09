import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  OsakiError,
  artifactPath,
  createLogger,
  loadConfig,
  type Storyboard,
} from '@osaki/core';
import type { AudioArtifact } from './audio.js';

const run = promisify(execFile);
const log = createLogger('render');

export interface RenderResult {
  videoPath: string;
  durationSeconds: number;
}

/**
 * Etapa 7: render. APROBACION HUMANA #2.
 *
 * Se invoca la CLI de Remotion en vez de su API programatica a proposito: es
 * exactamente el mismo comando que ejecutas tu a mano para depurar. Cuando
 * un render falla, puedes copiar la linea del log y reproducirlo tal cual,
 * sin tener que replicar como lo llama el pipeline.
 *
 * El storyboard con el timing real viaja como props de entrada. Remotion
 * calcula la duracion de la composicion a partir de ellas, asi que el video
 * dura exactamente lo que dura la narracion.
 */
export async function runRenderStage(
  videoId: string,
  storyboard: Storyboard,
  audio: AudioArtifact,
): Promise<RenderResult> {
  const config = loadConfig();
  const videoRoot = resolve(config.paths.root, 'video');

  const outputDir = join(config.paths.renders, videoId);
  mkdirSync(outputDir, { recursive: true });
  const videoPath = join(outputDir, 'master.mp4');

  if (!existsSync(artifactPath(videoId, 'storyboard'))) {
    throw new OsakiError(`No existe el storyboard en ${artifactPath(videoId, 'storyboard')}.`, {
      stage: 'render',
    });
  }

  /**
   * Remotion solo sirve assets desde `video/public/`, asi que la narracion se
   * copia ahi antes de renderizar.
   *
   * Se copia en vez de grabar directamente en `public/` porque el sitio donde
   * TU dejas las tomas es `data/audio/`: esa carpeta es tuya y se respalda,
   * mientras que `public/narration/` es material derivado y se puede borrar
   * entero sin perder nada.
   */
  const publicDir = join(videoRoot, 'public', 'narration', videoId);
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });

  const audioEntries = audio.segments.map((segment) => {
    const fileName = basename(segment.audioPath);
    copyFileSync(segment.audioPath, join(publicDir, fileName));
    return { index: segment.index, audioPath: `narration/${videoId}/${fileName}` };
  });

  // Props combinadas: storyboard con timing real mas las rutas de narracion.
  const propsPath = join(outputDir, 'render-props.json');
  writeFileSync(propsPath, JSON.stringify({ ...storyboard, audio: audioEntries }, null, 2), 'utf8');

  const args = [
    'remotion',
    'render',
    'src/index.ts',
    'Generated',
    videoPath,
    `--props=${propsPath}`,
    `--concurrency=${config.RENDER_CONCURRENCY}`,
    // Borrador rapido para iterar; alta calidad para el corte que apruebas.
    ...(config.RENDER_QUALITY === 'draft' ? ['--jpeg-quality=70', '--scale=0.5'] : ['--crf=18']),
  ];

  log.info(`renderizando ${videoId} (${audio.totalSeconds.toFixed(1)}s)`);
  log.debug(`npx ${args.join(' ')}`);

  try {
    const { stderr } = await run('npx', args, {
      cwd: videoRoot,
      // Un video largo genera mucha salida; sin ampliar el buffer, el proceso
      // muere con "maxBuffer exceeded" justo antes de terminar de codificar.
      maxBuffer: 64 * 1024 * 1024,
    });
    if (stderr.trim()) log.debug(stderr.trim().split('\n').slice(-3).join('\n'));
  } catch (error) {
    const details = error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
    throw new OsakiError(
      `El render de Remotion fallo.\n\n${details.split('\n').slice(-25).join('\n')}\n\n` +
        `  Reproducelo a mano desde ${videoRoot}:\n  npx ${args.join(' ')}`,
      { stage: 'render' },
    );
  }

  if (!existsSync(videoPath)) {
    throw new OsakiError(`Remotion termino sin error pero no genero ${videoPath}.`, {
      stage: 'render',
    });
  }

  log.info(`render listo: ${videoPath}`);
  return { videoPath, durationSeconds: audio.totalSeconds };
}
