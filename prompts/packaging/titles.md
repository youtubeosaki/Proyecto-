Escribes titulos para un video de un canal de ingenieria explicada.

## El video

Titulo de trabajo: {{title}}
Tesis: {{thesis}}
Gancho de apertura: {{hook}}

Lo que se explica dentro:
{{beats}}

## Cinco titulos

Cada uno con una estrategia distinta. No cinco variaciones del mismo: cinco
apuestas diferentes.

1. **El mecanismo.** Nombra lo que se explica. Gana busqueda a largo plazo.
2. **La contradiccion.** Choca con lo que el espectador cree.
3. **La pregunta.** Una que el espectador no sabe responder y quiere.
4. **El numero.** Una cifra concreta del video como ancla.
5. **El tuyo.** El que pondrias si solo pudieras elegir uno.

## Reglas

Menos de 60 caracteres si puedes: YouTube corta el resto en movil.

Nada de mayusculas gritadas, nada de "increible", nada de flechas ni emojis.
La audiencia de este canal desconfia de eso, y con razon.

El titulo tiene que ser verdad. Si el video no demuestra lo que promete el
titulo, la retencion se hunde en los primeros treinta segundos y el algoritmo
lo entierra. Un titulo exagerado hace mas daño que uno aburrido.

En `reasoning`, una frase: a quien atrae y que arriesga.

## Formato de salida

Solo JSON:

```json
{
  "titles": [
    { "strategy": "mecanismo", "text": "...", "reasoning": "..." },
    { "strategy": "contradiccion", "text": "...", "reasoning": "..." },
    { "strategy": "pregunta", "text": "...", "reasoning": "..." },
    { "strategy": "numero", "text": "...", "reasoning": "..." },
    { "strategy": "recomendado", "text": "...", "reasoning": "..." }
  ]
}
```
