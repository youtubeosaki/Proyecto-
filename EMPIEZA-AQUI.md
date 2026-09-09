# Empieza aquí

Guía práctica. Sin jerga. Si algo no se entiende, es culpa de la guía.

---

## Qué es esto

Una máquina que convierte **un tema** en **un vídeo de YouTube terminado**.

Tú pones el tema y tomas dos decisiones por el camino. La máquina hace el
resto: investiga, comprueba las fuentes, escribe el guion, monta las
animaciones, sincroniza tu voz, renderiza el vídeo y prepara título,
miniaturas y descripción.

**Nunca publica nada sin que tú lo apruebes.** Eso no es una opción que se
pueda desactivar: está construido así por dentro.

---

## Instalación (una sola vez)

Abre PowerShell en la carpeta del proyecto y ejecuta esto, en orden:

```powershell
pnpm install
pnpm setup
pnpm build
pnpm test
```

Si `pnpm test` termina sin errores, está todo bien.

Para verlo funcionando ahora mismo:

```powershell
pnpm render:demo
```

Sale un vídeo en `video/out/demo.mp4`. Ábrelo.

---

## Hacer un vídeo, paso a paso

### 1. Elige el tema

```powershell
pnpm osaki new "Como WhatsApp garantiza que no se pierda un mensaje"
```

Te devuelve un identificador tipo `vid_20260909_a1b2c3`. **Cópialo**: lo vas a
usar en todos los pasos siguientes. En esta guía lo llamo `<ID>`.

### 2. Investigación

```powershell
pnpm osaki run research --video <ID>
```

Busca datos sobre el tema y **comprueba cada uno contra su fuente**. Te dirá
algo así como *"9 afirmaciones verificadas, 3 descartadas"*, y te enseña por
qué descartó cada una.

Lo descartado **no aparece en el vídeo**. Ese es el punto: es lo que separa tu
canal de uno que se inventa los datos.

> Si te dice que no reunió suficientes afirmaciones verificadas, el tema no da
> para un vídeo honesto. Elige otro. No es un fallo, es la máquina haciendo su
> trabajo.

### 3. Elige el enfoque — **TU PRIMERA DECISIÓN**

```powershell
pnpm osaki run angles --video <ID>
```

Te propone **tres formas distintas** de contar el mismo tema, con su gancho de
apertura y por qué funcionaría cada una. Léelas y elige:

```powershell
pnpm osaki choose a2 --video <ID> --notes "Me gusta mas este"
```

(`a1`, `a2` o `a3`. Las notas son opcionales.)

### 4. Guion y montaje

```powershell
pnpm osaki run script --video <ID>
pnpm osaki run storyboard --video <ID>
```

Escribe el guion y decide qué animación acompaña a cada frase.

### 5. La voz

Aquí tienes dos caminos.

**Camino rápido, sin grabar nada:**

```powershell
node tools/make-scratch-narration.mjs <ID>
pnpm osaki run audio --video <ID>
```

Crea pistas **mudas** con la duración aproximada. Sirve para ver el montaje
completo y sus tiempos antes de grabar. Si una escena se queda corta, te
enteras ahora y no después de doce tomas.

**Camino real, con tu voz:**

```powershell
pnpm osaki run audio --video <ID>
```

Te dirá que faltan grabaciones y te dejará un archivo
`data/audio/<ID>/POR-GRABAR.md` con **el texto exacto de cada trozo** y el
nombre que tiene que llevar cada archivo.

Grábalos uno a uno en WAV, guárdalos con esos nombres, y vuelve a ejecutar el
mismo comando. Los que ya estén no se repiten.

> Grabar por trozos parece más trabajo, pero es al revés: si te equivocas,
> repites treinta segundos en vez de diez minutos.

### 6. Renderizar

```powershell
pnpm osaki run render --video <ID>
```

Tarda. Un vídeo de diez minutos son miles de imágenes. Sale en
`data/renders/<ID>/master.mp4`.

### 7. Revisa el vídeo — **TU SEGUNDA DECISIÓN**

Ábrelo. Míralo entero.

```powershell
# Si te convence:
pnpm osaki approve render --video <ID>

# Si no:
pnpm osaki approve render --video <ID> --reject --notes "La parte del medio sobra"
```

**Hasta que no apruebes, no hay forma de subir nada.**

### 8. Título, miniaturas y descripción

```powershell
pnpm osaki run packaging --video <ID>
```

Cinco títulos con distintas apuestas, descripción con capítulos y las fuentes,
etiquetas, y tres miniaturas. Te imprime el comando para generar cada
miniatura.

### 9. Subir

```powershell
pnpm osaki run publish --video <ID>
```

Sube el vídeo **en privado**. Nadie lo ve todavía.

Cuando quieras hacerlo público, entra en YouTube Studio y hazlo tú, mirando el
vídeo. La máquina no puede hacerlo, a propósito.

### 10. Shorts

```powershell
pnpm osaki run shorts --video <ID>
```

Elige los dos o tres trozos que se sostienen solos y prepara versiones
verticales con subtítulos.

### 11. Una semana después

```powershell
pnpm osaki run analytics --video <ID>
```

Lee cómo fue el vídeo de verdad y lo guarda. Con el tiempo, esos datos ayudan
a elegir mejores temas, porque sabe qué funcionó **en tu canal**.

---

## Cuando algo falla

Primero, siempre:

```powershell
pnpm osaki doctor
```

Te dice en cristiano qué está bien y qué falta.

**"Falta la aprobacion humana del render"** — Es correcto. Mira el vídeo y
ejecuta `pnpm osaki approve render --video <ID>`.

**"Faltan N grabaciones"** — No es un error. Abre
`data/audio/<ID>/POR-GRABAR.md`, graba lo que dice, y repite el comando.

**"La etapa X necesita el resultado de Y"** — Te saltaste un paso. Ejecuta el
que te indica.

**"El storyboard pide componentes que no existen"** — El guion pidió una
animación que aún no está construida. Te dice cuál. Es a propósito: prefiero
que se pare a que use otra parecida y quede mal sin avisar.

**"Sin cuota de YouTube"** — YouTube deja subir unos seis vídeos al día. Se
reinicia a medianoche (hora del Pacífico).

---

## Cuánto cuesta

| Qué | Coste |
|---|---|
| `LLM_PROVIDER=mock` | 0 € — respuestas de ejemplo, para probar |
| `LLM_PROVIDER=manual` | 0 € — copias y pegas en claude.ai |
| `LLM_PROVIDER=api` | 1–3 € por vídeo |
| Todo lo demás | 0 € |

Empieza en `mock`. Cuando quieras hacer un vídeo real sin gastar, usa
`manual`: la máquina te deja el texto preparado, lo pegas en claude.ai, pegas
la respuesta de vuelta, y sigue.

---

## Los dos comandos que más vas a usar

```powershell
pnpm osaki status     # en qué punto está cada vídeo
pnpm osaki doctor     # qué está bien y qué falta
```
