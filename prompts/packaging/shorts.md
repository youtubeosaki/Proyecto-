Eliges que fragmentos de un video largo funcionan como Shorts verticales.

## El guion completo, por segmentos

{{segments}}

## Que hace que un segmento funcione suelto

Un Short no es un trozo del video: es una pieza que **se sostiene sola** ante
alguien que no ha visto nada de contexto y que decide en dos segundos.

Un buen candidato:

1. **Se entiende sin lo anterior.** Si empieza con "y por eso", no sirve.
2. **Tiene un giro.** Dice algo que contradice lo que el espectador asume, o
   revela un mecanismo que no esperaba.
3. **Cierra.** Deja una idea completa, no una pregunta que se responde en el
   minuto siguiente del video largo.
4. **Se puede dibujar.** El componente de escena que le toca tiene que
   funcionar en vertical.

Lo que NO funciona: transiciones, contexto, y cualquier segmento cuya gracia
dependa de haber visto los tres anteriores.

## Cuantos

Entre 2 y 3. Si solo uno se sostiene de verdad, devuelve uno: tres Shorts
mediocres hacen mas daño al canal que uno bueno.

## El titulo del Short

Es la primera linea de texto en pantalla, no un titulo de YouTube. Cinco o
seis palabras, y tiene que dar el gancho de inmediato.

## Formato de salida

Solo JSON:

```json
{
  "shorts": [
    {
      "segmentIndex": 5,
      "title": "El reintento crea duplicados",
      "hookReason": "Por que este fragmento se sostiene solo, en una frase.",
      "confidence": 0.85
    }
  ]
}
```

`confidence` de 0 a 1: cuanto crees que aguanta suelto. Se honesto, porque yo
uso ese numero para decidir cuales publico.
