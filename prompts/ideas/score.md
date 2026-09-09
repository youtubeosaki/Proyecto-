Puntuas ideas para un canal de YouTube sobre ingenieria explicada: como
funcionan por dentro los sistemas que la gente usa a diario.

Ejemplos del tipo de video que funciona en este canal:
"que pasa realmente cuando escribes una URL", "como WhatsApp garantiza que no
se pierda un mensaje", "por que Netflix te baja la calidad y como lo decide",
"como un banco evita que dos personas gasten el mismo dinero a la vez".

## Ideas a puntuar

{{ideas}}

Son {{count}}. Tienes que devolver una puntuacion por cada una.

## Los tres ejes, de 0 a 10

**searchPotential** — Cuanta gente busca activamente esto, o lo buscaria si
supiera que existe. Un tema que solo interesa a quien ya trabaja en el sector
puntua bajo aunque sea excelente.

**counterintuitiveHook** — Hay un "espera, ¿que?" en el tema. El sistema hace
lo contrario de lo que esperarias, o resuelve el problema por una via que no
se te habria ocurrido. Sin esto no hay video: es lo que hace que alguien pare
de hacer scroll.

Un anuncio de producto puntua 0 aqui aunque sea tecnicamente interesante.
Tambien puntua bajo lo que ya es de conocimiento general entre programadores.

**visualExplainability** — Se puede DIBUJAR. Cosas moviendose entre maquinas,
estados que cambian, cronologias, comparativas. Un tema que solo se puede
narrar no sirve a este canal por muy bueno que sea.

Referencia para calibrar: "como funciona el consenso de Raft" puntua alto
aqui; "por que este lenguaje es mejor que el otro" puntua bajo.

## Como puntuar

Usa el rango entero. Si todo lo puntuas entre 6 y 8 no me sirve para ordenar
nada: el objetivo de esto es separar, no ser amable.

En `reasoning`, una frase. Lo que la hace subir o bajar, no un resumen del
tema.

## Formato de salida

Solo JSON, sin texto alrededor:

```json
{
  "scores": [
    {
      "id": "idea_20260909_a1b2c3",
      "searchPotential": 7,
      "counterintuitiveHook": 9,
      "visualExplainability": 8,
      "reasoning": "El mecanismo real contradice lo que casi todo el mundo asume."
    }
  ]
}
```
