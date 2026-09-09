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
  etapas, motor de Remotion con 6 componentes, sistema de movimiento continuo,
  transiciones, cama sonora generada y un video de prueba renderizado.
- **Fase 2 — completa.** Banco de ideas, investigacion con verificacion de
  fuentes, tres angulos con aprobacion humana, y guion con marcas de escena.
- **Fase 3 — completa.** Storyboard, narracion por segmentos, timing contra
  el audio real, render de la composicion generada, y empaque con titulos,
  descripcion, capitulos, fuentes, tags y miniaturas.
- **Fase 4 — completa.** Puente HTTP, workflows de n8n con los dos gates
  como nodos del grafo, y un comprobador que verifica que no se pueden
  saltar.
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
tools/            Generador de la cama sonora ambiental
packages/core     Config, errores, backoff, tipos, artefactos, catalogo de escenas
packages/db       SQLite: videos, etapas, aprobaciones, afirmaciones, analitica
packages/llm      Interfaz de LLM + 3 adaptadores + cargador de prompts
packages/ingest   RSS, Hacker News, deduplicacion y scoring de ideas
packages/research Investigacion + verificacion de fuentes
packages/script   Angulos, guion y parser de marcas de escena
packages/voice    Interfaz de voz: tu grabacion o TTS local
packages/compose  Storyboard, timing contra el audio y render
packages/server   Puente HTTP entre n8n y el pipeline
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

## El sistema de movimiento

Un video hecho de elementos que entran y se congelan se lee como una
presentacion de diapositivas, por muy cuidada que sea la entrada. Lo que lo
convierte en motion graphics es que **nada se queda completamente quieto**.

`video/src/theme/motion.ts` divide las animaciones en dos familias, y toda
escena usa al menos una de cada:

- **Entrada**, ocurre una vez: `enterUp` (sube, aparece y se enfoca desde un
  desenfoque), `popIn` (rebote corto para numeros y badges), `staggerWords`
  (titulos palabra a palabra, para que se lean mientras aparecen).
- **Continua**, no para nunca: `breathe` (escala oscilante del 0.6%), `drift`
  (deriva en dos ejes con periodos primos entre si, para que la trayectoria no
  se sienta ciclica), `oscillate`, `pulse`.

Encima van tres capas mas:

**Ambiente** (`Ambience.tsx`): tres manchas de aurora en deriva lenta, dos
rejillas a distinta escala moviendose en direcciones opuestas para dar
parallax, grano que rompe el banding de los degradados, y vineteado. Las
manchas son degradados radiales, no divs con `filter: blur()`: un blur de
200px sobre 900 frames multiplica el tiempo de render, un degradado radial ya
es suave por definicion.

**Camara** (`Frame.tsx`): cada escena recibe un push-in del 3-5% y una deriva
propia. Escenas vecinas usan `phase` distinta para que sus derivas no
coincidan. El ambiente queda fuera de la transformacion a proposito: si el
fondo hiciera zoom con el contenido, se perderia la profundidad.

**Transiciones** (`@remotion/transitions`): ninguna escena entra con corte
seco. Cada transicion empuja en la direccion del contenido que llega.

## Musica

`tools/make-ambient-bed.mjs` sintetiza la cama sonora y la escribe como WAV.

```powershell
node tools/make-ambient-bed.mjs 60 video/public/ambient-bed.wav
```

Se genera en vez de descargarse porque la musica con licencia es la via mas
rapida a un reclamo de Content ID, y un reclamo en un canal nuevo cuesta
tiempo deshacerlo. Esto es audio original producido por un algoritmo que esta
en el repositorio: su procedencia es auditable.

La pieza es deliberadamente aburrida. La menor, tonica y quinta como drone,
triada abierta encima, osciladores destemplados unos pocos cents entre si
(dos osciladores exactamente afinados suenan a sintetizador barato), ruido
rosa filtrado como aire, y periodos de LFO primos entre si para que no se
perciba el bucle. Sin percusion y sin melodia identificable: una cama para
contenido tecnico tiene que sostener la narracion sin pedir atencion.

Normalizada a -14 dBFS de pico, y en la composicion suena al 32%. Cuando
entre la narracion en la Fase 3, esta pista baja otros 6 dB.

## Oki, el personaje del canal

`video/src/components/mascot/` — un cuadrado redondeado con dos ojos, una
antena descentrada y una sonrisa fija. Seis expresiones, todas construidas
deformando la misma geometria base.

Esta dibujado **por completo desde codigo**, no como imagen. Eso no es
capricho: un PNG se degrada al escalar, no se puede animar por partes y, sobre
todo, no garantiza que dentro de dos años siga siendo exactamente el mismo. Un
componente parametrico con su geometria congelada si. Y sale gratis en los
Shorts verticales y en las miniaturas: es el mismo componente a otra escala.

`identity.ts` esta congelado a proposito y explica cada decision. Un espectador
que vea el video 40 tiene que reconocer al mismo personaje del video 1; si
alguien cambia un radio, cada video seguira siendo coherente consigo mismo y
nadie notara el fallo hasta ver dos videos seguidos.

Revisa la identidad de un vistazo con la hoja de contacto:

```powershell
pnpm --filter @osaki/video exec remotion still src/index.ts MascotSheet out/oki.png --frame=100
```

Detalles que lo hacen leerse como vivo y no como un icono pegado:

- **Parpadeo determinista.** Intervalo variable entre 70 y 145 frames, con
  doble parpadeo ocasional. Remotion renderiza frames en paralelo en varios
  procesos, asi que la aleatoriedad es funcion pura del frame y de una
  semilla: el mismo frame sale identico lo renderice quien lo renderice.
- **Respiracion, flotacion y balanceo** con fases derivadas de la semilla,
  para que dos Okis en pantalla no se muevan al unisono.
- **La mirada vaga sola** aunque la escena pida una direccion fija.
- **La antena late mas rapido en `thinking`**, que es el estado que
  representa trabajo interno.

### Como se mueve e interactua

`OkiStage` lo coloca en COORDENADAS DE LA ESCENA y lo mueve entre puntos, en
vez de anclarlo a una esquina con CSS. La diferencia no es cosmetica: anclado
a una esquina, Oki es una pegatina encima del video; con coordenadas puede
pararse junto a un nodo concreto, acompañar a un paquete mientras viaja y
señalar lo que se esta narrando.

Una posicion puede ser un punto fijo **o una funcion del frame**. Lo segundo
es lo que permite seguir a algo que se mueve: el escenario no sabe que es un
paquete, solo pregunta "donde estas en este frame".

`NetworkDiagram` acepta un `guide` con la coreografia. Los beats referencian
**nodos y paquetes por su identificador, no coordenadas**:

```tsx
guide={{
  size: 240,
  beats: [
    { atFrame: s(0.4), atNode: 'browser',  lookAtNode: 'browser', point: true, expression: 'curious' },
    { atFrame: s(2.4), atNode: 'resolver', lookAtNode: 'resolver', point: true, expression: 'focused' },
    { atFrame: s(3.9), followPacket: 1, lookAtPacket: 1, expression: 'happy' },
    { atFrame: s(5.5), followPacket: 2, lookAtPacket: 2, expression: 'focused' },
    { atFrame: s(7.4), atNode: 'server',   lookAtNode: 'server', point: true, expression: 'surprised' },
  ],
}}
```

Si se mueve un nodo, Oki se mueve con el. Si un paquete cambia de velocidad,
Oki lo sigue igual. Una coreografia escrita en pixeles se desincroniza al
primer retoque del diagrama.

Para que el desplazamiento se lea como movimiento y no como deslizamiento:
acelera y frena entre puntos, rebota mientras camina, se inclina hacia donde
va (con tope: pasado cierto angulo deja de leerse como impulso y empieza a
leerse como que se cae) y llega ya con la expresion del destino puesta.

Al señalar lanza un haz de guiones que corre hacia el objetivo y un anillo que
late sobre el. El anillo cierra el gesto: sin el, el haz apunta a la nada.

Oki vive DENTRO del contenedor del diagrama, asi que comparte la
transformacion de camara con el resto de la escena. Eso es lo que hace que se
lea como parte del plano y no como una capa pegada encima.

## Fase 2: del tema al guion

Cuatro etapas, cada una ejecutable sola. Todo el recorrido funciona con
`LLM_PROVIDER=mock` y las fixtures de `data/fixtures/`, sin gastar nada:

```powershell
pnpm osaki run ideas                              # llena el banco de ideas
pnpm osaki ideas                                  # las mejores, ordenadas
pnpm osaki new "Como WhatsApp garantiza que no se pierda un mensaje"
pnpm osaki run research --video <id>              # hechos + verificacion
pnpm osaki run angles   --video <id>              # APROBACION HUMANA #1
pnpm osaki choose a2    --video <id> --notes "..."
pnpm osaki run script   --video <id>              # guion con marcas de escena
```

### La verificacion de fuentes filtra en dos pasadas

Primero **reglas mecanicas**, antes de gastar un solo token: sin fuente,
fuente de nivel debil, sin cita literal, o URL con forma de inventada
(dominio de ejemplo, identificador opaco larguisimo en la ruta). No hace
falta un modelo para rechazar una afirmacion que no trae fuente, y una regla
determinista no se deja convencer por una cita bien escrita.

Despues un **revisor que trabaja en contra del investigador**. Son dos
llamadas separadas a proposito y no una sola con instrucciones de "se
riguroso": en una sola pasada el modelo juzga su propio trabajo y lo aprueba
casi todo. Separandolas, el revisor recibe las afirmaciones sin saber quien
las escribio ni por que.

El revisor rechaza si hay que razonar dos pasos para ir de la cita a la
afirmacion, o si la afirmacion añade precision que la fuente no tiene. Si no
se pronuncia sobre una afirmacion, esa cuenta como rechazada: **silencio no
es aprobacion**.

Lo que sobrevive es lo unico que ve el generador de guion. Lo demas queda en
un reporte de descartes que lees tu. Y si un tema no reune el minimo de
afirmaciones verificadas (`MIN_VERIFIED_CLAIMS`), la etapa **falla**: un tema
que no da para un video honesto de diez minutos da para relleno, y es mejor
saberlo aqui que en el guion.

### El guion no puede pedir escenas que no existen

`packages/core/src/scenes.ts` es el catalogo, en datos puros sin React, y lo
consumen los dos lados: el paquete `video` mapea cada tipo a su componente de
Remotion, y las etapas de guion y storyboard inyectan las descripciones en el
prompt. Si esta lista viviera solo del lado de React, el generador de guion
llevaria una copia y las dos se separarian a la primera escena nueva.

Si el guion pide un tipo que no esta en el catalogo, la etapa **falla y dice
cual falta**. Mapearlo al componente mas parecido produciria un video que se
renderiza sin errores y explica mal: el peor fallo posible, porque nadie lo
revisa al no haber nada en rojo.

### Trazabilidad hasta la fuente

Cada segmento del guion lleva los ids de las afirmaciones en las que se
apoya, y cada afirmacion lleva su fuente y su cita literal. Se puede seguir
cualquier frase del video hasta el RFC del que sale.

## Fase 3: del guion al video

```powershell
pnpm osaki run storyboard --video <id>    # marcas de escena -> props
node tools/make-scratch-narration.mjs <id>  # opcional: pistas mudas de prueba
pnpm osaki run audio      --video <id>    # narracion y timing real
pnpm osaki run render     --video <id>    # APROBACION HUMANA #2
```

### La narracion va por segmentos, no en un archivo largo

Tres razones, y la primera es la que decide:

1. **La duracion de cada archivo ES el timing de su escena.** Con un audio
   largo habria que alinearlo contra el texto, lo que exige reconocimiento de
   voz y falla justo en los terminos tecnicos que son el contenido del canal.
2. Una retoma cuesta un segmento, no el video entero.
3. Cambiar una frase del guion solo invalida su segmento.

Con `VOICE_PROVIDER=file` (por defecto), la etapa busca tus WAV y, si faltan,
escribe `data/audio/<id>/POR-GRABAR.md` con el texto exacto de cada segmento
y el nombre de archivo que le toca. Grabas, reejecutas, y los que ya existan
no se repiten.

`tools/make-scratch-narration.mjs` genera pistas **mudas** con la duracion
estimada por numero de palabras. Sirve para ver el montaje completo con sus
tiempos antes de grabar nada: descubrir que una escena se queda corta cuesta
mucho menos ahi que despues de doce tomas.

Con `VOICE_PROVIDER=piper` genera voz local gratuita, util como pista de
referencia o como voz definitiva.

### El timing se acumula redondeado

Cada escena dura lo que dura su audio mas 0,35 s de aire. La duracion se
redondea a frames enteros y se acumula **el valor ya redondeado**, no el
exacto: acumulando el exacto y redondeando al final, los errores se suman y
el audio acaba desplazado en los ultimos segmentos.

### La composicion se construye desde el storyboard

`Generated` recibe el storyboard como props de entrada y calcula su propia
duracion con `calculateMetadata`, asi que el video dura exactamente lo que
dura la narracion sin que nadie mantenga un numero en dos sitios.

```powershell
npx remotion render src/index.ts Generated out.mp4 --props=<storyboard.json>
```

El pipeline invoca esa misma linea de comandos en vez de la API programatica
de Remotion, a proposito: cuando un render falla, el error trae el comando
exacto y lo puedes reproducir a mano sin replicar como lo llama el pipeline.

Si una escena tiene un tipo desconocido o props que no validan, **no se
sustituye por otra parecida**: se pinta un cartel rojo con el nombre que
falta. Un fallback silencioso produce un render sin errores que explica mal,
y ese es el peor fallo posible porque nadie lo revisa.

### Empaque

```powershell
pnpm osaki run packaging --video <id>
```

Cinco titulos con cinco estrategias distintas (mecanismo, contradiccion,
pregunta, numero, y el recomendado), descripcion con capitulos, fuentes y
tags, y props para tres miniaturas.

Dos cosas NO las escribe el modelo:

- **Las marcas de tiempo de los capitulos** se calculan desde el timing real
  del audio y se le pasan ya hechas. Un modelo estimando timecodes produce
  capitulos desplazados, y un capitulo desplazado es peor que no tener
  capitulos.
- **Las fuentes** se copian literalmente desde las afirmaciones verificadas.
  Dejar que el modelo las reescriba abriria la puerta a que cambie una URL, y
  una fuente mal citada vale menos que ninguna.

Las miniaturas son una composicion de Remotion, no un archivo de diseño: asi
heredan fondo, tipografia y personaje sin que nadie recuerde los valores. El
cuerpo del titular se ajusta a la longitud del texto, porque con un tamaño
fijo un titular largo se sale de la miniatura sin avisar.

## Fase 4: n8n orquestando

```powershell
docker compose -f docker/docker-compose.yml up -d   # n8n en localhost:5678
pnpm osaki serve                                    # el puente, en otra terminal
```

Importa los workflows de `n8n/workflows/` desde el panel y crea una
credencial **Header Auth** llamada `Osaki` con `x-osaki-token` y el valor de
tu `N8N_WEBHOOK_TOKEN`.

### Por que un puente HTTP y no "Execute Command"

n8n corre dentro de Docker. Un nodo Execute Command ejecutaria **dentro del
contenedor**, donde no hay repositorio, ni Remotion, ni ffmpeg, ni tus
grabaciones. El puente corre en tu Windows, que es donde vive todo eso, y n8n
lo llama en `http://host.docker.internal:4599`.

Para que el contenedor llegue, el servidor escucha en `0.0.0.0` y no en
`127.0.0.1`, lo que lo deja visible en la red local. Por eso exige un token
compartido y **se niega a arrancar sin el**: un endpoint que dispara renders y
aprueba publicaciones no puede quedar abierto porque alguien no leyo la
documentacion.

Un gate pendiente devuelve **409**, no 500, para que n8n lo distinga de un
fallo real y ponga el flujo en espera en vez de reintentar.

### Los gates son nodos del grafo

`02-produccion.json` tiene dos nodos **Wait** en modo formulario. No son
condiciones que se puedan saltar con un flag: n8n **suspende la ejecucion**
ahi y solo la reanuda cuando envias el formulario.

```
Tema -> Crear -> Investigar -> Angulos -> [GATE 1] -> Guion -> Storyboard
     -> Audio -> Render -> [GATE 2] -> Registrar -> Empaquetar
```

### Y una prueba que lo verifica

El grafo de n8n se edita arrastrando cajas. Es facilisimo mover una arista sin
darse cuenta de que acaba de saltarse una aprobacion, y el fallo no se nota
hasta que un video se publica solo.

```powershell
node tools/check-approval-gates.mjs
```

Calcula, para cada nodo, el **minimo** numero de aprobaciones que hay en algun
camino desde un disparador hasta el, y falla si es menor que el que exige la
etapa. El minimo y no el maximo: basta con que exista UNA ruta que evite la
aprobacion para que la garantia se rompa.

La primera version de este script se detenia en el primer gate, asi que nunca
llegaba a mirar lo que hay detras del segundo. Se descubrio conectando a mano
un nodo de subida que se saltaba el gate 2 y comprobando que el script lo
dejaba pasar. Una prueba que no falla cuando debe es peor que no tenerla.
