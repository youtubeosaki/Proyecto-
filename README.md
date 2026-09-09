# Osaki

Pipeline semi-automatizado de produccion de video para un canal de YouTube
sobre ingenieria explicada: como funcionan por dentro los sistemas que la
gente usa a diario.

## La premisa que condiciona todo el diseno

YouTube desmonetiza contenido "inautentico": produccion masiva sin aporte
creativo humano identificable. Por eso este sistema **no es automatico**.

Automatiza el trabajo mecanico y se detiene en dos puntos obligatorios:

| Gate | Cuando | Que decides |
|---|---|---|
| **#1 Angulo** | Tras la investigacion | Eliges 1 de 3 propuestas y editas lo que quieras |
| **#2 Render** | Antes de cualquier subida | Ves el video terminado y decides si sale |

Esto no es una comprobacion que se pueda saltar con un flag. En el grafo de
n8n no existe ningun nodo de subida antes del webhook de aprobacion #2, y la
etapa `publish` consulta la tabla `approvals` antes de hacer nada. La
restriccion es estructural.

## Estado

- **Fase 1 — completa.** Monorepo, configuracion, estado en SQLite, CLI por
  etapas, motor de Remotion con 6 componentes y un video de prueba renderizado.
- Fase 2 — investigacion y guion via Claude, con verificacion de fuentes.
- Fase 3 — audio, timing y render end-to-end.
- Fase 4 — n8n orquestando, con las aprobaciones humanas.
- Fase 5 — subida, Shorts y bucle de analitica.

## Arranque (PowerShell)

```powershell
pnpm install
Copy-Item .env.example .env

# Comprueba la configuracion y crea la base de datos
pnpm osaki doctor

# Renderiza el video de prueba de 30 segundos
pnpm render:demo

# O abre el editor visual de Remotion
pnpm studio
```

El render sale en `video/out/demo.mp4`.

## Coste

No hay tier gratuito en la API de Anthropic, pero el pipeline no te obliga a
usarla. `LLM_PROVIDER` tiene tres valores:

| Valor | Que hace | Coste |
|---|---|---|
| `mock` | Lee respuestas desde `data/fixtures/`. Para desarrollar y testear. | 0 |
| `manual` | Escribe el prompt a disco, tu lo pegas en claude.ai, pegas la respuesta de vuelta. | 0 (usa tu suscripcion) |
| `api` | SDK de Anthropic. | ~1-3 USD por video |

Misma interfaz, mismo codigo de pipeline. Puedes construir y depurar todo el
sistema sin gastar nada.

El resto del stack es gratuito: n8n self-hosted, Remotion, ffmpeg, SQLite,
YouTube Data API (10.000 unidades/dia; una subida cuesta 1.600) y Analytics API.

## Comandos

```powershell
pnpm osaki stages                        # Que etapas hay y en que fase llegan
pnpm osaki new "<titulo>"                # Crea un video
pnpm osaki status                        # Estado de todos los videos
pnpm osaki run <etapa> --video <id>      # Ejecuta una etapa aislada
pnpm osaki approve <gate> --video <id>   # Registra tu decision
pnpm osaki doctor                        # Diagnostico de configuracion
```

Cada etapa se ejecuta sola. Un fallo en la etapa 6 no obliga a repetir la 1:
la etapa lee el artefacto de la anterior desde disco y sigue desde ahi.

## Estructura

```
packages/core     Config, errores tipados, reintentos con backoff, tipos de dominio
packages/db       SQLite: videos, etapas, aprobaciones, afirmaciones, analitica
packages/llm      Interfaz de LLM + 3 adaptadores + cargador de prompts
packages/cli      Binario `osaki`
video/            Proyecto de Remotion: tema, componentes, composiciones
prompts/          Prompts versionados, nunca embebidos en codigo
docker/           n8n self-hosted
n8n/workflows/    Workflows exportados
```

## Las tres decisiones que sostienen el resto

**Registro de escenas tipado.** `video/src/scenes/registry.ts` es la unica
fuente de verdad sobre que puede dibujar el canal. Si el guion pide una escena
que no existe, la etapa de storyboard falla y dice que componente falta. No hay
fallback generico a proposito: un fallback silencioso produce videos mediocres
que nadie revisa.

**Verificacion como filtro, no como anotacion.** Una afirmacion sin fuente
primaria recuperable no llega al generador de guion. Se queda en un reporte de
descartes que lees tu. Esto es lo que separa el canal de una granja de
contenido, asi que esta en el camino critico, no en un paso opcional.
`UNVERIFIED_CLAIMS_POLICY=flag` relaja la regla si alguna vez lo necesitas.

**La DB guarda punteros, no payloads.** Los guiones, documentos de hechos y
storyboards viven en disco como JSON. SQLite guarda en que etapa esta cada
video y donde esta cada artefacto. Los artefactos se pueden leer, editar a mano
y versionar; una columna BLOB no.
