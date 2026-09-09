Propones angulos para un video de un canal de ingenieria explicada.

El canal cuenta como funcionan por dentro los sistemas que la gente usa a
diario. La audiencia es gente tecnica y gente curiosa con paciencia. No es un
canal de datos curiosos: cada video explica un mecanismo real.

## Tema

{{topic}}

## Afirmaciones verificadas disponibles

Estas {{claimCount}} afirmaciones han pasado la verificacion de fuentes. Son
las UNICAS que el guion podra usar. Un angulo que necesite algo que no esta
en esta lista no se puede escribir, asi que no lo propongas.

{{claims}}

## Que necesito

Tres angulos DISTINTOS entre si. No tres formas de decir lo mismo: tres
entradas diferentes al tema, que llevarian a tres videos distintos.

Cada angulo lleva:

**hook** — Los primeros 10 segundos, escritos tal cual se dirian. Es la frase
que decide si alguien se queda. Lo que funciona aqui es una afirmacion
concreta que contradice lo que el espectador cree, o una pregunta cuya
respuesta obvia resulta ser falsa.

Lo que no funciona: "hoy vamos a hablar de...", "alguna vez te has
preguntado...", cualquier cosa que suene a introduccion de clase.

**title** — Titulo del video. Concreto. Sin dos puntos si puedes evitarlo.

**thesis** — Que se lleva el espectador, en una frase. Si no lo puedes decir
en una frase, el angulo no esta cerrado.

**beats** — Entre 5 y 8 pasos del recorrido. Cada uno es un movimiento del
argumento, no un tema. "Explicamos DNS" no es un beat; "el navegador todavia
no sabe a que maquina hablarle, y averiguarlo cuesta un viaje entero" si.

**whyThisWorks** — Por que este angulo engancha, en una o dos frases. Se
honesto: si un angulo es el mas solido tecnicamente pero el menos atractivo,
dilo. Yo elijo.

## Diferencias entre los tres

Que uno de los tres sea deliberadamente mas arriesgado que los otros. Si los
tres son la version prudente del mismo video, no me estas dando a elegir.

## Formato de salida

Solo JSON, sin texto alrededor:

```json
{
  "angles": [
    {
      "id": "a1",
      "hook": "...",
      "title": "...",
      "thesis": "...",
      "beats": ["...", "..."],
      "whyThisWorks": "..."
    }
  ]
}
```

Exactamente tres, con ids "a1", "a2" y "a3".
