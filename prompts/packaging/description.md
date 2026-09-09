Escribes la descripcion de YouTube de un video de ingenieria explicada.

## El video

Titulo: {{title}}
Tesis: {{thesis}}

Segmentos con su marca de tiempo:
{{chapters}}

Fuentes usadas (todas verificadas):
{{sources}}

## Que necesito

**Resumen**: dos o tres frases. Que explica el video y por que importa. Se
lee en la busqueda de YouTube y en las previsualizaciones, asi que la primera
frase tiene que sostenerse sola.

**Capitulos**: uno por bloque tematico, no uno por segmento. Formato
`0:00 Titulo del capitulo`. El primero SIEMPRE empieza en 0:00 o YouTube no
los reconoce. Titulos cortos y descriptivos, no graciosos.

**Fuentes**: la lista tal cual, con titulo y URL. Van en la descripcion
porque son la diferencia entre este canal y uno que se inventa los datos, y
porque alguien las va a comprobar.

**Tags**: entre 8 y 12. Terminos que alguien escribiria en el buscador. Sin
relleno ni repeticiones del titulo.

## Tono

Sin llamadas a la accion. Sin "no olvides suscribirte". Sin hashtags de
relleno. La descripcion es documentacion del video, no un anuncio.

## Formato de salida

Solo JSON:

```json
{
  "summary": "...",
  "chapters": [{ "time": "0:00", "title": "..." }],
  "tags": ["...", "..."]
}
```

Las fuentes las añade el pipeline, no las repitas en la salida.
