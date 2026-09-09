import type React from 'react';
import { createContext, useContext } from 'react';
import { useVideoConfig } from 'remotion';

/**
 * LIENZO LOGICO DE UNA ESCENA
 *
 * Los componentes que maquetan por coordenadas (el diagrama de red) necesitan
 * saber sobre que tamaño estan dibujando. Lo natural seria `useVideoConfig()`,
 * pero eso devuelve el tamaño de la COMPOSICION, y en un Short la composicion
 * mide 1080x1920 mientras la escena se dibuja en un lienzo de 1920x1080 que
 * despues se escala.
 *
 * Sin esto, el mismo diagrama que se ve bien en el video largo sale deformado
 * en el Short: reparte los nodos sobre un lienzo alto y estrecho y luego lo
 * encoge. El fallo no da error, solo produce un Short feo.
 *
 * Con el contexto, la escena siempre maqueta sobre su lienzo logico y el
 * envoltorio decide como colocarlo.
 */

export interface SceneSize {
  width: number;
  height: number;
}

const SceneSizeContext = createContext<SceneSize | null>(null);

export const SceneSizeProvider: React.FC<{ width: number; height: number; children: React.ReactNode }> = ({
  width,
  height,
  children,
}) => <SceneSizeContext.Provider value={{ width, height }}>{children}</SceneSizeContext.Provider>;

/** Tamaño del lienzo. Sin proveedor, el de la composicion, que es lo correcto
 *  en el video largo donde escena y composicion coinciden. */
export function useSceneSize(): SceneSize {
  const provided = useContext(SceneSizeContext);
  const config = useVideoConfig();
  return provided ?? { width: config.width, height: config.height };
}
